/**
 * Glue between the server, the board and the HUD.
 *
 * - Server updates go through a queue: each one's events animate in order on the board, then the board reconciles
 *   to that update's state, so updates never snap and the AI's moves play one at a time. The rival's plays are
 *   revealed big over the board first; its turn can be skipped (one move, until you must decide, or to its end).
 * - Pointer and keyboard input become one of the server's legal actions (see core/intent.ts). Selecting a card opens
 *   a small menu beside it, and places on the board glow where it can go: click one (or drag the card there).
 */
import { card, sameAction, type Action, type DeckChoice, type DuelUpdate, type GameEvent, type PlayerId } from "@sigilbound/engine";
import { describeEvent } from "../core/describe.js";
import {
  dimsOf, dropKeys, dropMarks, groupByVerb, matches, openDims, optionsFor, plansAtDrop, plansFor, primaryVerb,
  remainingMoves, resolve, verbOf, type Dim, type Plan, type Source, type Verb,
} from "../core/intent.js";
import { playCaption, playCard, playDestination, playsIn, playTargets, type Play } from "../core/plays.js";
import { diff, wanted } from "../core/reconcile.js";
import type { Net } from "../net/net.js";
import {
  saveSettings, type DuelState, type Focus, type LogLine, type Playback, type Popup, type PopupSrc, type Settings,
  type UiActions, type UiState,
} from "../ui/state.js";
import type { BoardView } from "../visuals/board.js";

let logId = 0;
let bannerId = 0;
let revealId = 0;
let toastId = 0;

interface Queued { u: DuelUpdate; endsAt: number | null }

type Drag =
  | { kind: "hand"; uid: number; x0: number; y0: number; started: boolean; plans: Plan[]; hot: string | null }
  | { kind: "monster"; lane: number; x0: number; y0: number; started: boolean; plans: Plan[]; hot: string | null };

/** Rival events that mean "the AI did something" (so playback speed and skipping apply). */
const RIVAL_ACTS = new Set<GameEvent["t"]>([
  "summon", "cast", "flip", "ambush", "set", "bind", "crest", "move", "position", "attack", "attackStep", "endTurn", "pass",
]);
/** Board dims: chosen by clicking a place on the board (or 1/2/3), not a button. */
const BOARD_DIMS: Dim[] = ["lane", "target", "to"];

/** What the rival did while you skipped, for the summary toast. */
interface Tally { summons: number; casts: string[]; dealt: number; lost: number; binds: number; sets: number }
const emptyTally = (): Tally => ({ summons: 0, casts: [], dealt: 0, lost: 0, binds: 0, sets: 0 });

export class Controller implements UiActions {
  private board: BoardView | null = null;
  private boardReady: Promise<BoardView> | null = null;
  private queue: Queued[] = [];
  private busy = false;
  private followUp: Action | null = null;
  private drag: Drag | null = null;
  private hintKeys: string[] = [];
  /** Skip the rest of the update being shown (S / →). */
  private skipNow = false;
  private revealSkip: (() => void) | null = null;
  private tally: Tally = emptyTally();
  private hurriedTurn = -1;
  /** The last input was the mouse (so a played card's keyboard focus ring shouldn't linger). */
  private pointerInput = false;

  constructor(
    private readonly ui: UiState,
    private readonly net: Net,
    private readonly makeBoard: (host: HTMLElement) => Promise<BoardView>,
  ) {
    window.addEventListener("keydown", (e) => this.onKey(e));
    window.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerdown", () => { this.pointerInput = true; }, true);
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
    // The duel uses right-click (switch position); never show the browser's menu over it.
    window.addEventListener("contextmenu", (e) => { if (this.ui.app.get().screen === "duel") e.preventDefault(); });
    // A clicked button keeps focus, and Enter would click it again on top of the key's own meaning: drop it.
    window.addEventListener("click", (e) => {
      if (e.target instanceof Element && e.target.closest("button")) {
        requestAnimationFrame(() => { if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur(); });
      }
    }, true);
  }

  // ---- from the server ----

  onUpdate(u: DuelUpdate): void {
    this.queue.push({ u, endsAt: u.window ? performance.now() + u.window.msLeft : null });
    this.ui.app.set({ screen: "duel", error: null, hasSaved: true });
    if (!this.busy) void this.pump();
  }

  private async pump(): Promise<void> {
    this.busy = true;
    try {
      while (this.queue.length) {
        const q = this.queue.shift()!;
        try {
          await this.present(q);
        } catch (err) {
          console.error(err);
          // Whatever went wrong, show the latest state.
          this.ui.duel.set({ reveal: null });
          this.board?.sync(q.u.view.state, q.u.view.you);
        }
      }
    } finally {
      this.busy = false;
    }
    // Once things are quiet, put every sprite exactly where it belongs.
    const b = this.board;
    if (b) {
      await new Promise((r) => setTimeout(r, 400));
      if (!this.busy && !this.queue.length) {
        const cur = this.ui.duel.get().update;
        if (cur) b.sync(cur.view.state, cur.view.you);
        b.settle();
      }
    }
  }

  private logLines(u: DuelUpdate, plays: Play[]): LogLine[] {
    const me = u.view.you;
    const byAt = new Map(plays.map((p) => [p.at, p]));
    return u.events.flatMap((e, at) => {
      const play = byAt.get(at);
      const text = play ? playCaption(play, u.view.state, me) : describeEvent(e, me);
      if (!text) return [];
      const tone: LogLine["tone"] = e.t === "turn" ? "turn" : "p" in e ? (e.p === me ? "mine" : "theirs") : "plain";
      const id = "card" in e && typeof e.card === "string" && e.card !== "hidden" ? e.card : undefined;
      // Effects already in the play's caption still get their own line: the log keeps every detail.
      return [{ id: ++logId, text: text[0]!.toUpperCase() + text.slice(1), tone, card: id, play: !!play }];
    });
  }

  private async present({ u, endsAt }: Queued): Promise<void> {
    const d = this.ui.duel.get();
    const prev = d.update;
    const me = u.view.you;
    const opp: PlayerId = me === 0 ? 1 : 0;
    const fresh = !prev || prev.duelId !== u.duelId;
    const board = this.board ?? (this.boardReady ? await this.boardReady : null);
    if (fresh) { board?.reset(); this.setPlayback("normal", false); this.tally = emptyTally(); }
    const plays = playsIn(u.events);
    const log = [...(fresh ? [] : d.log), ...this.logLines(u, plays)].slice(-300);
    const s = u.view.state;
    const rivalActs = !fresh && u.events.some((e) => "p" in e && e.p === opp && RIVAL_ACTS.has(e.t));
    // Auto-skip: fast-forward the rival's turn as it starts.
    if (!fresh && d.settings.autoSkip && d.playback === "normal" && s.active === opp &&
        u.events.some((e) => e.t === "turn" && e.p === opp)) {
      this.setPlayback("decision", false);
    }
    const playback = this.ui.duel.get().playback;
    if (playback !== "normal" && rivalActs) this.count(u.events, me);
    const newHand = s.players[me].hand;
    const drawn = new Set(u.events.flatMap((e) => (e.t === "draw" && e.p === me && e.uid !== undefined ? [e.uid] : [])));
    const had = new Set((fresh ? [] : d.hand).map((c) => c.uid));
    const hand = newHand.filter((c) => had.has(c.uid) || !drawn.has(c.uid));
    const popup = d.popup && this.popupStillValid(d.popup, u) ? d.popup : null;
    const inspect = d.inspect && this.popupStillValid({ src: d.inspect } as Popup, u) ? d.inspect : null;
    this.ui.duel.set({
      update: u, log, hand, popup, inspect,
      inFlight: d.inFlight.filter((uid) => newHand.some((c) => c.uid === uid)),
      mulligan: s.step === "mulligan" ? d.mulligan : [],
      windowEndsAt: endsAt,
      ask: d.ask && newHand.some((c) => c.uid === d.ask!.uid) ? d.ask : null,
      confirmEnd: null,
      ...(fresh ? { pile: null, focus: null, banner: null, logOpen: false, hover: null, reveal: null } : {}),
    });
    if (board) {
      const speedNow = () => {
        if (fresh || this.skipNow) return 0;
        const lag = this.queue.length >= 2 || this.queue.some((q) => q.u.window?.responder === q.u.view.you);
        let k = lag ? 0.3 : 1;
        if (rivalActs) {
          const pb = this.ui.duel.get().playback;
          if (pb === "turn") k = 0;
          else if (pb === "decision" || this.ui.duel.get().settings.aiSpeed === "fast") k = Math.min(k, 0.25);
        }
        return k;
      };
      board.speed = speedNow();
      board.tapSigils(s, me);
      const byAt = new Map(plays.map((p) => [p.at, p]));
      let clearBeam: (() => void) | null = null;
      let beamUntil = -1;
      for (let i = 0; i < u.events.length; i++) {
        const e = u.events[i] as GameEvent;
        board.speed = speedNow();
        const quiet = board.speed === 0;
        if (e.t === "turn" && !fresh && !(quiet && e.p !== me)) {
          this.ui.duel.set({ banner: { id: ++bannerId, text: e.p === me ? "Your turn" : "Rival's turn", tone: e.p === me ? "me" : "opp" } });
          await board.wait(700);
        } else if (e.t === "attackStep" && !fresh && !quiet) {
          this.ui.duel.set({ banner: { id: ++bannerId, text: e.p === me ? "Attack!" : "Rival attacks!", tone: "attack" } });
          await board.wait(500);
        }
        const play = byAt.get(i);
        let revealed = false;
        if (play && play.event.p === opp && !quiet) {
          clearBeam = await this.reveal(play, u, board);
          beamUntil = play.at + play.effects.length;
          revealed = true;
          board.speed = speedNow();
        }
        await board.animate(e, s, me, revealed);
        if (clearBeam && i >= beamUntil) { clearBeam(); clearBeam = null; }
        if (e.t === "draw" && e.p === me && e.uid !== undefined) {
          const shown = new Set(this.ui.duel.get().hand.map((c) => c.uid));
          shown.add(e.uid);
          this.ui.duel.set({ hand: newHand.filter((c) => shown.has(c.uid)) });
        }
      }
      clearBeam?.();
      board.speed = 1;
      board.sync(s, me);
      if (!fresh && !this.skipNow && speedNow() > 0) await board.wait(this.queue.length ? 60 : 120);
    }
    this.skipNow = false;
    this.ui.duel.set({ hand: newHand, reveal: null });
    this.refreshMarks();
    this.afterPlayback(u);
    // An attack picked during the Main step: now that the attack step has started, send it.
    if (this.followUp) {
      const f = this.followUp;
      this.followUp = null;
      if (u.legal.some((a) => sameAction(a, f))) this.act(f);
    }
  }

  /**
   * The rival's play, big over the board: it flies out of the rival's hand, holds so you can read it (with beams to
   * whatever it hits and a caption), then flies to where it goes. Click or any key skips the hold.
   */
  private async reveal(play: Play, u: DuelUpdate, board: BoardView): Promise<(() => void) | null> {
    const me = u.view.you;
    const id = playCard(play.event);
    const n = ++revealId;
    const base = { n, id, caption: playCaption(play, u.view.state, me), from: "hand:opp", to: playDestination(play.event, me) };
    this.ui.duel.set({ reveal: { ...base, phase: "in" } });
    await board.wait(280);
    const targets = playTargets(play, me);
    const clear = targets.length ? board.beam(targets) : null;
    const hold = id === "hidden" ? 700 : play.effects.length || play.event.t !== "summon" ? 1400 : 1100;
    await Promise.race([board.wait(hold), new Promise<void>((r) => { this.revealSkip = r; })]);
    this.revealSkip = null;
    if (this.ui.duel.get().reveal?.n === n) this.ui.duel.set({ reveal: { ...base, phase: "out" } });
    await board.wait(240);
    if (this.ui.duel.get().reveal?.n === n) this.ui.duel.set({ reveal: null });
    return clear;
  }

  skipReveal(): void {
    this.revealSkip?.();
  }

  // ---- AI playback ----

  private setPlayback(p: Playback, notify = true): void {
    const was = this.ui.duel.get().playback;
    if (p === was) return;
    this.ui.duel.set({ playback: p });
    const u = this.ui.duel.get().update;
    if (p !== "normal" && u) {
      this.tally = emptyTally();
      this.hurriedTurn = u.view.state.turn;
      this.net.send({ t: "hurry", duelId: u.duelId, until: p });
    }
    if (p === "normal" && was !== "normal" && notify) this.showTally();
  }

  private count(events: GameEvent[], me: PlayerId): void {
    const t = this.tally;
    for (const e of events) {
      if (!("p" in e)) continue;
      if (e.t === "summon" && e.p !== me) t.summons++;
      else if ((e.t === "cast" || e.t === "flip" || e.t === "ambush") && e.p !== me) t.casts.push(card(e.card).name);
      else if (e.t === "bind" && e.p !== me) t.binds++;
      else if (e.t === "set" && e.p !== me) t.sets++;
      else if (e.t === "lp" && e.delta < 0) { if (e.p === me) t.dealt -= e.delta; }
      else if (e.t === "destroyed" && e.p === me) t.lost++;
    }
  }

  private showTally(): void {
    const t = this.tally;
    const parts: string[] = [];
    if (t.summons) parts.push(`summoned ${t.summons}`);
    if (t.casts.length) parts.push(`cast ${[...new Set(t.casts)].join(", ")}`);
    if (t.sets) parts.push(`set ${t.sets} face down`);
    if (t.binds) parts.push(`bound ${t.binds}`);
    if (t.lost) parts.push(`destroyed ${t.lost} of yours`);
    if (t.dealt) parts.push(`dealt ${t.dealt}`);
    this.tally = emptyTally();
    const text = parts.length ? `Rival: ${parts.join(", ")}` : "Rival: nothing much";
    const id = ++toastId;
    this.ui.duel.set({ toast: { id, text } });
    setTimeout(() => { if (this.ui.duel.get().toast?.id === id) this.ui.duel.set({ toast: null }); }, 4500);
  }

  /** Ends a skip once you have something to decide (or the rival's turn is over). */
  private afterPlayback(u: DuelUpdate): void {
    const pb = this.ui.duel.get().playback;
    if (pb === "normal") return;
    const s = u.view.state;
    const me = u.view.you;
    if (this.queue.length) return;
    const yours = u.legal.length > 0;
    const turnOver = s.step === "over" || (s.active === me && s.turn !== this.hurriedTurn);
    if ((pb === "decision" && yours) || turnOver) this.setPlayback("normal");
  }

  skip(mode: "move" | "decision" | "turn"): void {
    const u = this.ui.duel.get().update;
    if (!u) return;
    if (mode === "move") {
      this.skipNow = this.busy;
      this.revealSkip?.();
      this.board?.flush();
      if (this.ui.duel.get().reveal) this.ui.duel.set({ reveal: null });
      return;
    }
    this.setPlayback(mode);
    if (mode === "turn" || this.ui.duel.get().settings.aiSpeed === "fast" || mode === "decision") {
      this.revealSkip?.();
      this.board?.flush();
      if (mode === "turn") this.skipNow = this.busy;
    }
  }

  setSettings(patch: Partial<Settings>): void {
    const settings = { ...this.ui.duel.get().settings, ...patch };
    saveSettings(settings);
    this.ui.duel.set({ settings });
  }

  /** The rival is acting (or about to), and nothing is waiting on you: skip controls apply. */
  private rivalPlaying(): boolean {
    const d = this.ui.duel.get();
    const u = d.update;
    if (!u) return false;
    const s = u.view.state;
    if (s.step === "mulligan" || s.step === "over") return false;
    return (s.active !== u.view.you && s.window?.responder !== u.view.you) || (this.busy && !!d.reveal);
  }

  onError(message: string): void {
    if (message === "duel not found") this.ui.app.set({ screen: "title", hasSaved: false });
    this.ui.app.set({ error: message });
    this.ui.duel.set({ inFlight: [] });
    this.followUp = null;
    setTimeout(() => { if (this.ui.app.get().error === message) this.ui.app.set({ error: null }); }, 3000);
  }

  onStatus(connected: boolean): void {
    this.ui.app.set({ connected });
    if (connected && this.ui.app.get().screen === "duel") this.resume();
  }

  // ---- from the UI ----

  newDuel(deck: DeckChoice): void {
    this.ui.duel.set({ update: null, hand: [], log: [], popup: null, inspect: null, ask: null, pile: null, mulligan: [], inFlight: [] });
    this.ui.app.set({ popup: null, deckList: null });
    this.net.send({ t: "new", deck });
  }

  resume(): void {
    const saved = this.net.saved();
    if (saved) this.net.send({ t: "resume", ...saved });
  }

  leave(): void {
    this.net.forget();
    this.ui.app.set({ screen: "title", hasSaved: false });
    this.ui.duel.set({ update: null, hand: [], log: [], popup: null, inspect: null, pile: null });
  }

  act(a: Action): void {
    const u = this.ui.duel.get().update;
    if (!u) return;
    this.net.send({ t: "act", duelId: u.duelId, action: a });
  }

  send(p: Plan, handUid?: number): void {
    const d = this.ui.duel.get();
    this.ui.duel.set({
      popup: null, ask: null, inspect: null, handHover: null, ...(this.pointerInput && d.focus?.area === "hand" ? { focus: null } : {}),
      inFlight: handUid !== undefined ? [...d.inFlight, handUid] : d.inFlight,
    });
    this.hintKeys = [];
    if (p.viaAttackStep) {
      this.followUp = p.action;
      this.act({ type: "attackStep" });
    } else {
      this.act(p.action);
    }
    this.refreshMarks();
  }

  toggleMulligan(uid: number): void {
    const m = this.ui.duel.get().mulligan;
    this.ui.duel.set({ mulligan: m.includes(uid) ? m.filter((x) => x !== uid) : [...m, uid] });
  }

  endTurn(confirmed = false): void {
    const u = this.ui.duel.get().update;
    if (!u?.legal.some((a) => a.type === "endTurn")) return;
    const left = remainingMoves(u);
    if (!confirmed && left > 0) {
      this.ui.duel.set({ confirmEnd: left });
      return;
    }
    this.ui.duel.set({ confirmEnd: null, popup: null });
    this.act({ type: "endTurn" });
  }

  cancelEnd(): void {
    this.ui.duel.set({ confirmEnd: null });
  }

  toggle(what: "help" | "logOpen"): void {
    const d = this.ui.duel.get();
    this.ui.duel.set({ [what]: !d[what] } as Partial<DuelState>);
  }

  openPile(p: DuelState["pile"]): void {
    this.ui.duel.set({ pile: p, popup: null });
  }

  closePile(): void {
    this.ui.duel.set({ pile: null });
  }

  showDeckList(deck: DeckChoice | null): void {
    this.ui.app.set({ deckList: deck });
  }

  setFocus(f: Focus | null): void {
    this.ui.duel.set({ focus: f });
    this.refreshMarks();
  }

  hoverHand(uid: number | null): void {
    this.ui.duel.set({ handHover: uid });
  }

  attachBoard(host: HTMLElement | null): void {
    if (!host) return;
    if (!this.boardReady) {
      this.boardReady = this.makeBoard(host).then((b) => {
        this.board = b;
        this.wireCanvas(b);
        const u = this.ui.duel.get().update;
        if (u) { b.speed = 0; b.sync(u.view.state, u.view.you); b.speed = 1; b.settle(); }
        this.refreshMarks();
        return b;
      });
    } else {
      void this.boardReady.then((b) => b.mount(host));
    }
  }

  // ---- selection (the action menu) and the reading view ----

  private popupInDuel(): boolean {
    return this.ui.app.get().screen === "duel";
  }

  private getPopup(): Popup | null {
    return this.popupInDuel() ? this.ui.duel.get().popup : this.ui.app.get().popup;
  }

  private setPopup(p: Popup | null): void {
    if (this.popupInDuel()) this.ui.duel.set({ popup: p });
    else this.ui.app.set({ popup: p });
    this.refreshMarks();
  }

  private sourceOf(src: PopupSrc): Source | null {
    return src.kind === "hand" || src.kind === "monster" || src.kind === "spell" ? src : null;
  }

  /** The plans a popup offers. */
  popupPlans(p: Popup | null = this.getPopup()): Plan[] {
    const u = this.ui.duel.get().update;
    if (!p || !u || !this.popupInDuel()) return [];
    const src = this.sourceOf(p.src);
    return src ? plansFor(src, u) : [];
  }

  private popupStillValid(p: Popup, u: DuelUpdate): boolean {
    const s = u.view.state, me = u.view.you;
    switch (p.src.kind) {
      case "hand": { const uid = p.src.uid; return s.players[me].hand.some((c) => c.uid === uid); }
      case "monster": return !!s.players[me].monsters[p.src.lane];
      case "enemy": return !!s.players[me === 0 ? 1 : 0].monsters[p.src.lane];
      case "spell": return !!s.players[me].spells[p.src.lane];
      case "card": return true;
    }
  }

  /** Select a card (its menu opens beside it); cards with nothing to choose open the reading view instead. */
  openPopup(src: PopupSrc): void {
    if (!this.popupInDuel()) { this.ui.app.set({ popup: { src, verb: null, picks: {}, order: [], cursor: {} } }); return; }
    const source = this.sourceOf(src);
    const u = this.ui.duel.get().update;
    if (!source || !u) { this.inspect(src); return; }
    const verb = primaryVerb(groupByVerb(plansFor(source, u)), source);
    this.ui.duel.set({ inspect: null, handHover: null });
    this.setPopup({ src, verb, picks: {}, order: [], cursor: {} });
  }

  inspect(src: PopupSrc | null): void {
    if (!this.popupInDuel()) {
      this.ui.app.set({ popup: src ? { src, verb: null, picks: {}, order: [], cursor: {} } : null });
      return;
    }
    this.ui.duel.set({ inspect: src, handHover: null });
  }

  closePopup(): void {
    this.hintKeys = [];
    if (!this.popupInDuel()) { this.ui.app.set({ popup: null }); return; }
    this.setPopup(null);
  }

  popupVerb(verb: Verb | null): void {
    const p = this.getPopup();
    if (!p) return;
    if (verb) {
      const plans = groupByVerb(this.popupPlans(p)).get(verb) ?? [];
      // Nothing to choose: just do it.
      if (plans.length === 1 || (plans.length && !openDims(plans).length)) {
        this.send(plans[0]!, p.src.kind === "hand" ? p.src.uid : undefined);
        return;
      }
    }
    this.setPopup({ ...p, verb, picks: {}, order: [] });
  }

  popupPick(dim: Dim, value: string): void {
    const p = this.getPopup();
    if (!p) return;
    const picks = { ...p.picks, [dim]: value };
    // Drop picks that no longer fit together.
    const plans = this.verbPlans(p);
    for (const k of Object.keys(picks) as Dim[]) {
      if (k !== dim && !optionsFor(plans, k, picks).includes(picks[k]!)) delete picks[k];
    }
    this.setPopup({ ...p, picks, order: [...p.order.filter((x) => x !== dim), dim] });
  }

  popupConfirm(): void {
    const p = this.getPopup();
    if (!p) return;
    const plan = resolve(this.verbPlans(p), p.picks);
    if (plan) this.send(plan, p.src.kind === "hand" ? p.src.uid : undefined);
  }

  popupBack(): void {
    const p = this.getPopup();
    if (!p) return;
    if (p.order.length) {
      const order = p.order.slice(0, -1);
      const picks = { ...p.picks };
      delete picks[p.order[p.order.length - 1]!];
      this.setPopup({ ...p, picks, order });
      return;
    }
    const src = this.sourceOf(p.src);
    const u = this.ui.duel.get().update;
    const primary = src && u ? primaryVerb(groupByVerb(plansFor(src, u)), src) : null;
    if (p.verb && p.verb !== primary) {
      this.setPopup({ ...p, verb: primary, picks: {}, order: [] });
      return;
    }
    this.closePopup();
  }

  /** Dev check: what the board shows vs the latest state (empty when they match). */
  debugBoardDiff(): unknown[] {
    const u = this.ui.duel.get().update;
    if (!u || !this.board) return ["no board"];
    return [...diff(this.board.shown(), wanted(u.view.state, u.view.you)), ...this.board.invisible()];
  }

  boardRect(key: string): DOMRect | null {
    return this.board?.clientRect(key) ?? null;
  }

  popupPlansOf(p: Popup): Plan[] {
    return this.popupPlans(p);
  }

  verbPlans(p: Popup): Plan[] {
    if (!p.verb) return [];
    return groupByVerb(this.popupPlans(p)).get(p.verb) ?? [];
  }

  /**
   * Plans a click on the board can finish for the selection: the open verb's (filtered by picks), plus Bind on the
   * Sigil row for a hand card; a selected monster offers its attacks and moves straight away.
   */
  private selectionPlans(p: Popup): Plan[] {
    const all = this.popupPlans(p);
    const out: Plan[] = [];
    if (p.verb) out.push(...(groupByVerb(all).get(p.verb) ?? []).filter((x) => matches(x, p.picks)));
    else if (p.src.kind === "monster") {
      out.push(...all.filter((x) => x.action.type === "attack" || x.action.type === "move" ||
        (x.action.type === "crest" && x.action.to !== undefined)));
    }
    if (p.src.kind === "hand" && p.verb !== "bind") out.push(...all.filter((x) => x.action.type === "bind"));
    return out;
  }

  /** The plans at a client point: an exact hit, or the nearest legal place within a few pixels. */
  private hitAt(plans: Plan[], clientX: number, clientY: number, allowField: boolean): { key: string; plans: Plan[] } | null {
    const b = this.board;
    const u = this.ui.duel.get().update;
    if (!b || !u || !plans.length) return null;
    const me = u.view.you, s = u.view.state;
    const keys = b.keysAt(clientX, clientY).filter((k) => allowField || k !== "field");
    const hit = plansAtDrop(plans, keys, me, s);
    if (hit) return hit;
    const near = b.nearest(new Set(plans.flatMap((p) => dropKeys(p.action, me))), clientX, clientY);
    return near ? plansAtDrop(plans, [near], me, s) : null;
  }

  /** A place was picked for a selection or a drop: do it, or ask what's still open (position, targets...). */
  private resolveHit(hit: { key: string; plans: Plan[] }, src: Source): void {
    if (src.kind === "monster") { this.send(hit.plans[0]!); return; }
    const uid = src.kind === "hand" ? src.uid : undefined;
    const summons = hit.plans.filter((p) => p.action.type === "summon");
    if (uid !== undefined && summons.length && summons.length === hit.plans.length) {
      const positions = new Set(summons.map((p) => (p.action as { position: string }).position));
      if (positions.size > 1) {
        this.ui.duel.set({ ask: { uid, key: hit.key, plans: summons, choice: "atk" }, popup: null });
        this.refreshMarks();
        return;
      }
      const pos = (summons[0]!.action as { position: "atk" | "def" }).position;
      this.ui.duel.set({ ask: { uid, key: hit.key, plans: summons, choice: pos } });
      this.answerAsk(pos);
      return;
    }
    if (hit.plans.length === 1) { this.send(hit.plans[0]!, uid); return; }
    // Still a choice to make (which monster to bring back...): keep the menu open with what's been decided.
    const verb = verbOf(hit.plans[0]!.action);
    const same = hit.plans.filter((p) => verbOf(p.action) === verb);
    const picks: Partial<Record<Dim, string>> = {};
    for (const dim of BOARD_DIMS) {
      const vals = new Set(same.map((p) => dimsOf(p.action)[dim] ?? ""));
      if (vals.size === 1) { const v = [...vals][0]!; if (v) picks[dim] = v; }
    }
    this.setPopup({ src, verb, picks, order: Object.keys(picks) as Dim[], cursor: {} });
  }

  hint(keys: string[] | null): void {
    this.hintKeys = keys ?? [];
    this.refreshMarks();
  }

  answerAsk(position: "atk" | "def" | null): void {
    const ask = this.ui.duel.get().ask;
    if (!ask) return;
    this.ui.duel.set({ ask: null });
    if (!position) { this.refreshMarks(); return; }
    const plans = ask.plans.filter((p) => p.action.type === "summon" && p.action.position === position);
    if (plans.length === 1) this.send(plans[0]!, ask.uid);
    else if (plans.length > 1) {
      // Abyssal Leviathan: which monsters to return is chosen in the menu.
      const a = plans[0]!.action as Extract<Action, { type: "summon" }>;
      this.ui.duel.set({
        popup: { src: { kind: "hand", uid: ask.uid }, verb: "summon", picks: { lane: String(a.lane), position }, order: ["lane", "position"], cursor: {} },
      });
      this.refreshMarks();
    }
  }

  // ---- board highlights ----

  private refreshMarks(): void {
    const b = this.board;
    const d = this.ui.duel.get();
    const u = d.update;
    if (!b || !u) return;
    const me = u.view.you;
    const s = u.view.state;
    let targets = new Map<string, "drop" | "attack" | "replace">();
    const hot = new Set<string>(this.hintKeys);
    if (this.drag?.started) {
      targets = dropMarks(this.drag.plans, s, me);
      if (this.drag.hot) hot.add(this.drag.hot);
    } else if (d.popup) {
      targets = dropMarks(this.selectionPlans(d.popup), s, me);
      const done = d.popup.verb ? resolve(this.verbPlans(d.popup), d.popup.picks) : null;
      if (done) for (const k of dropKeys(done.action, me)) hot.add(k);
    }
    targets.delete("field");
    if (d.ask) hot.add(d.ask.key);
    let focus: string | null = null;
    if (d.focus?.area === "board") focus = `me:monster:${d.focus.lane}`;
    if (d.popup?.src.kind === "monster") focus = `me:monster:${d.popup.src.lane}`;
    else if (d.popup?.src.kind === "spell") focus = `me:spell:${d.popup.src.lane}`;
    b.setMarks({ targets, hot, focus });
  }

  // ---- pointer ----

  handPointerDown(uid: number, e: { clientX: number; clientY: number; button: number }): void {
    if (e.button !== 0) return;
    const u = this.ui.duel.get().update;
    if (!u) return;
    this.drag = { kind: "hand", uid, x0: e.clientX, y0: e.clientY, started: false, plans: plansFor({ kind: "hand", uid }, u), hot: null };
  }

  private wireCanvas(b: BoardView): void {
    const c = b.canvas;
    c.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const d = this.ui.duel.get();
      const u = d.update;
      if (!u) return;
      if (d.reveal) { this.skipReveal(); return; }
      // A glowing place for the selected card: do it.
      if (d.popup) {
        const src = this.sourceOf(d.popup.src);
        const hit = src ? this.hitAt(this.selectionPlans(d.popup), e.clientX, e.clientY, false) : null;
        if (src && hit) {
          if (hit.plans.every((p) => p.action.type === "bind") && src.kind === "hand") this.send(hit.plans[0]!, src.uid);
          else this.resolveHit(hit, src);
          return;
        }
      }
      const keys = b.keysAt(e.clientX, e.clientY);
      const mine = keys.find((k) => k.startsWith("me:monster:"));
      const lane = mine ? Number(mine.split(":")[2]) : -1;
      if (mine && u.view.state.players[u.view.you].monsters[lane]) {
        const plans = plansFor({ kind: "monster", lane }, u).filter((p) => ["attack", "move"].includes(p.action.type) ||
          (p.action.type === "crest" && p.action.to !== undefined));
        this.drag = { kind: "monster", lane, x0: e.clientX, y0: e.clientY, started: false, plans, hot: null };
      } else {
        this.boardClick(keys);
      }
    });
    c.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const u = this.ui.duel.get().update;
      if (!u) return;
      const key = b.keysAt(e.clientX, e.clientY).find((k) => k.startsWith("me:monster:"));
      if (!key) return;
      const lane = Number(key.split(":")[2]);
      const a = u.legal.find((x) => x.type === "position" && x.lane === lane);
      if (a) this.act(a);
    });
    c.addEventListener("pointermove", (e) => {
      if (this.drag?.started) return;
      const u = this.ui.duel.get().update;
      const keys = b.keysAt(e.clientX, e.clientY);
      const clickable = keys.some((k) => /^(me|opp):monster|^me:spell|^sigil:me|^deck:me|^discard/.test(k));
      c.style.cursor = clickable ? "pointer" : "default";
      if (!u) return;
      const s = u.view.state, me = u.view.you;
      const badge = b.badgeAt(e.clientX, e.clientY);
      let key: string | null = badge?.key ?? null;
      if (!key) {
        for (const k of keys) {
          const [side, kind, l] = k.split(":");
          const p = side === "me" ? me : side === "opp" ? (me === 0 ? 1 : 0) : null;
          if (p === null) {
            if (side === "sigil" && kind === "me") { key = k; break; }
            continue;
          }
          if (kind === "monster" && s.players[p].monsters[Number(l)]) { key = k; break; }
          if (kind === "spell" && s.players[p].spells[Number(l)]) { key = k; break; }
        }
      }
      const cur = this.ui.duel.get().hover;
      const next = key ? { key, kw: badge?.kw ?? null } : null;
      if (cur?.key !== next?.key || cur?.kw !== next?.kw) this.ui.duel.set({ hover: next });
    });
    c.addEventListener("pointerleave", () => { if (this.ui.duel.get().hover) this.ui.duel.set({ hover: null }); });
  }

  private onPointerMove(e: PointerEvent): void {
    const dr = this.drag;
    const b = this.board;
    if (!dr || !b) return;
    if (!dr.started) {
      if (Math.hypot(e.clientX - dr.x0, e.clientY - dr.y0) < 6) return;
      dr.started = true;
      this.ui.duel.set({ popup: null, ask: null, focus: null, inspect: null, handHover: null, hover: null });
    }
    const hit = this.hitAt(dr.plans, e.clientX, e.clientY, true);
    dr.hot = hit?.key ?? null;
    if (dr.kind === "hand") {
      const u = this.ui.duel.get().update!;
      const c = u.view.state.players[u.view.you].hand.find((x) => x.uid === dr.uid);
      this.ui.duel.set({ drag: { id: c?.id ?? "hidden", x: e.clientX, y: e.clientY, over: !!hit } });
    } else {
      b.setAim(dr.lane, e.clientX, e.clientY, !!hit);
    }
    this.refreshMarks();
  }

  private onPointerUp(e: PointerEvent): void {
    const dr = this.drag;
    this.drag = null;
    const b = this.board;
    if (!dr) return;
    this.ui.duel.set({ drag: null });
    b?.setAim(null);
    const u = this.ui.duel.get().update;
    if (!u || !b) return;
    if (!dr.started) {
      // A click: select it, or unselect it if it already was.
      const p = this.ui.duel.get().popup;
      if (dr.kind === "hand") {
        if (u.view.state.step === "mulligan") { this.inspect({ kind: "hand", uid: dr.uid }); return; }
        if (p?.src.kind === "hand" && p.src.uid === dr.uid) this.closePopup();
        else this.openPopup({ kind: "hand", uid: dr.uid });
      } else if (p?.src.kind === "monster" && p.src.lane === dr.lane) this.closePopup();
      else this.openPopup({ kind: "monster", lane: dr.lane });
      return;
    }
    const hit = this.hitAt(dr.plans, e.clientX, e.clientY, true);
    this.refreshMarks();
    if (!hit) return;
    this.resolveHit(hit, dr.kind === "hand" ? { kind: "hand", uid: dr.uid } : { kind: "monster", lane: dr.lane });
  }

  private boardClick(keys: string[]): void {
    const d = this.ui.duel.get();
    const u = d.update;
    if (!u) return;
    if (d.popup) this.closePopup();
    const s = u.view.state, me = u.view.you;
    const opp = me === 0 ? 1 : 0;
    for (const k of keys) {
      const [a, b, c] = k.split(":");
      if (a === "opp" && b === "monster" && s.players[opp].monsters[Number(c)]) return this.inspect({ kind: "enemy", lane: Number(c) });
      if (a === "me" && b === "spell" && s.players[me].spells[Number(c)]) return this.openPopup({ kind: "spell", lane: Number(c) });
      if (a === "sigil" && b === "me") {
        const sg = s.players[me].sigils[Number(c)];
        if (sg && sg.id !== "hidden") return this.inspect({ kind: "card", id: sg.id, note: "Bound as a Sigil. It's face down: only you know which card it is." });
      }
      if (a === "deck" && b === "me") return this.openPile({ kind: "deck" });
      if (a === "discard") return this.openPile({ kind: "discard", side: b as "me" | "opp" });
    }
  }

  // ---- keyboard ----

  /** What I / Space reads: the hovered thing, else the keyboard focus. */
  private inspectTarget(): PopupSrc | null {
    const d = this.ui.duel.get();
    const u = d.update;
    if (!u) return null;
    const s = u.view.state, me = u.view.you;
    const hand = d.hand.filter((c) => !d.inFlight.includes(c.uid));
    if (d.popup) return d.popup.src;
    if (d.hover) {
      const [side, kind, l] = d.hover.key.split(":");
      const lane = Number(l);
      if (kind === "monster") return side === "me" ? { kind: "monster", lane } : { kind: "enemy", lane };
      if (kind === "spell" && side === "me") return { kind: "spell", lane };
      if (side === "sigil") { const sg = s.players[me].sigils[Number(kind === "me" ? l : 0)]; if (sg && sg.id !== "hidden") return { kind: "card", id: sg.id }; }
    }
    if (d.handHover !== null && hand.some((c) => c.uid === d.handHover)) return { kind: "hand", uid: d.handHover };
    if (d.focus?.area === "hand" && hand[d.focus.index]) return { kind: "hand", uid: hand[d.focus.index]!.uid };
    if (d.focus?.area === "board" && s.players[me].monsters[d.focus.lane]) return { kind: "monster", lane: d.focus.lane };
    return null;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    this.pointerInput = false;
    const key = e.key;
    const app = this.ui.app.get();
    const d = this.ui.duel.get();
    const handled = () => e.preventDefault();

    if (app.screen === "title") {
      if (app.popup) {
        if (key === "Escape" || key === "Enter" || key === "i" || key === "I") { handled(); this.closePopup(); }
        return;
      }
      if (app.deckList && key === "Escape") { handled(); this.showDeckList(null); }
      return;
    }
    const u = d.update;
    if (!u) return;
    const me = u.view.you;
    const s = u.view.state;

    // Any key skips a reveal's hold; these keys do nothing else.
    if (d.reveal) {
      if (["s", "S", "ArrowRight"].includes(key)) { handled(); this.skip("move"); return; }
      this.skipReveal();
      if (["Escape", "Enter", " "].includes(key)) { handled(); return; }
    }
    if (d.help) {
      if (key === "Escape" || key === "?") { handled(); this.toggle("help"); }
      return;
    }
    if (d.inspect) {
      if (key === "Escape" || key === "i" || key === "I" || key === " ") { handled(); this.inspect(null); }
      return;
    }
    if (d.confirmEnd !== null) {
      if (key === "Enter" || key === "e" || key === "E") { handled(); this.endTurn(true); }
      else if (key === "Escape") { handled(); this.cancelEnd(); }
      return;
    }
    if (d.ask) {
      if (["a", "A", "ArrowLeft", "ArrowUp", "1"].includes(key)) { handled(); this.ui.duel.set({ ask: { ...d.ask, choice: "atk" } }); }
      else if (["d", "D", "ArrowRight", "ArrowDown", "2"].includes(key)) { handled(); this.ui.duel.set({ ask: { ...d.ask, choice: "def" } }); }
      else if (key === "Enter" || key === " ") { handled(); this.answerAsk(d.ask.choice); }
      else if (key === "Escape") { handled(); this.answerAsk(null); }
      return;
    }
    if (d.pile) {
      if (key === "Escape") { handled(); this.closePile(); }
      return;
    }
    if (key === "i" || key === "I" || (key === " " && !d.popup && s.step !== "mulligan")) {
      const t = this.inspectTarget();
      if (t) { handled(); this.inspect(t); return; }
    }
    if (d.popup) {
      this.popupKey(e, d.popup);
      return;
    }
    if (key === "?") { handled(); this.toggle("help"); return; }
    if (key === "l" || key === "L") { handled(); this.toggle("logOpen"); return; }

    // The rival's turn: skip its playback.
    if (this.rivalPlaying()) {
      if (key === "s" || key === "S" || key === "ArrowRight") { handled(); this.skip("move"); return; }
      if (key === "F" || key === "End") { handled(); this.skip("turn"); return; }
      if (key === "f") { handled(); this.skip("decision"); return; }
    }
    if (key === "e" || key === "E") { handled(); this.endTurn(); return; }

    // The Ambush window: P passes, numbers play.
    if (s.window?.responder === me && u.legal.length) {
      const ambushes = u.legal.filter((a) => a.type === "ambush");
      if (key === "p" || key === "P") { handled(); this.act({ type: "pass" }); return; }
      if (/^[1-9]$/.test(key) && ambushes[Number(key) - 1]) { handled(); this.act(ambushes[Number(key) - 1]!); return; }
      return;
    }
    if (key === "p" || key === "P") return;

    const hand = d.hand.filter((c) => !d.inFlight.includes(c.uid));
    if (s.step === "mulligan" && !s.players[me].mulliganDone) {
      const f = d.focus?.area === "hand" ? d.focus.index : -1;
      if (key === "ArrowRight" || key === "ArrowLeft") {
        handled();
        const n = hand.length;
        const i = f < 0 ? 0 : (f + (key === "ArrowRight" ? 1 : n - 1)) % n;
        this.setFocus({ area: "hand", index: i });
      } else if (key === " " && f >= 0 && hand[f]) { handled(); this.toggleMulligan(hand[f]!.uid); }
      else if (/^[1-9]$/.test(key) && hand[Number(key) - 1]) { handled(); this.toggleMulligan(hand[Number(key) - 1]!.uid); }
      else if (key === "Enter") { handled(); this.act({ type: "mulligan", uids: d.mulligan }); }
      return;
    }

    const myLanes = [0, 1, 2].filter((l) => s.players[me].monsters[l]);
    const f = d.focus;
    if (/^[1-9]$/.test(key)) {
      const i = Number(key) - 1;
      if (hand[i]) { handled(); this.setFocus({ area: "hand", index: i }); this.openPopup({ kind: "hand", uid: hand[i]!.uid }); }
      return;
    }
    if (key === "ArrowLeft" || key === "ArrowRight") {
      handled();
      const dir = key === "ArrowRight" ? 1 : -1;
      if (f?.area === "board" && myLanes.length) {
        const at = myLanes.indexOf(f.lane);
        const next = myLanes[(at + dir + myLanes.length) % myLanes.length]!;
        this.setFocus({ area: "board", lane: next });
      } else if (hand.length) {
        const i = f?.area === "hand" ? (f.index + dir + hand.length) % hand.length : dir > 0 ? 0 : hand.length - 1;
        this.setFocus({ area: "hand", index: i });
      }
      return;
    }
    if (key === "ArrowUp" || (key === "Tab" && !e.shiftKey && f?.area !== "board")) {
      handled();
      if (myLanes.length) this.setFocus({ area: "board", lane: f?.area === "board" ? f.lane : myLanes[0]! });
      return;
    }
    if (key === "ArrowDown" || key === "Tab") {
      handled();
      if (hand.length) this.setFocus({ area: "hand", index: f?.area === "hand" ? f.index : 0 });
      return;
    }
    if (key === "Enter") {
      if (f?.area === "hand" && hand[f.index]) { handled(); this.openPopup({ kind: "hand", uid: hand[f.index]!.uid }); }
      else if (f?.area === "board" && s.players[me].monsters[f.lane]) { handled(); this.openPopup({ kind: "monster", lane: f.lane }); }
      return;
    }
    if (key === "Escape" && f) { handled(); this.setFocus(null); }
  }

  private popupKey(e: KeyboardEvent, p: Popup): void {
    const key = e.key;
    const handled = () => e.preventDefault();
    const groups = groupByVerb(this.popupPlans(p));
    const plans = this.verbPlans(p);
    const dims = openDims(plans);
    const src = this.sourceOf(p.src);
    if (key === "Escape") { handled(); this.popupBack(); return; }
    if (key === "b" || key === "B") { if (groups.has("bind")) { handled(); this.popupVerb("bind"); } return; }
    if (key === "s" || key === "S") { if (groups.has("position")) { handled(); this.popupVerb("position"); } return; }
    if (key === "m" || key === "M") { if (groups.has("move")) { handled(); this.popupVerb("move"); } return; }
    if (key === "c" || key === "C") { if (groups.has("crest")) { handled(); this.popupVerb("crest"); } return; }
    if (key === "?") { handled(); this.toggle("help"); return; }
    if (key === "Enter" || key === " ") {
      handled();
      if (p.verb && resolve(plans, p.picks)) this.popupConfirm();
      else if (p.verb && !dims.length && plans.length) this.send(plans[0]!, p.src.kind === "hand" ? p.src.uid : undefined);
      else if (!p.verb && groups.has("attack")) this.popupVerb("attack");
      else if (!p.verb && groups.size === 1) this.popupVerb([...groups.keys()][0]!);
      else if (!p.verb && groups.size === 0) this.closePopup();
      return;
    }
    if (!p.verb) {
      if ((key === "a" || key === "A") && groups.has("attack")) { handled(); this.popupVerb("attack"); }
      return;
    }
    if (dims.includes("position") && !dims.includes("lane")) {
      if (["a", "A", "ArrowUp"].includes(key)) { handled(); if (optionsFor(plans, "position", p.picks).includes("atk")) this.popupPick("position", "atk"); return; }
      if (["d", "D", "ArrowDown"].includes(key)) { handled(); if (optionsFor(plans, "position", p.picks).includes("def")) this.popupPick("position", "def"); return; }
    }
    const main = dims.find((x) => x !== "position");
    if (!main) return;
    const opts = optionsFor(plans, main, p.picks);
    if (/^[1-9]$/.test(key)) {
      handled();
      const n = Number(key) - 1;
      const v = main === "lane" ? String(n) : opts[n];
      if (v === undefined || !opts.includes(v)) return;
      if (BOARD_DIMS.includes(main) && src) {
        // Same as clicking that place on the board.
        const fit = plans.filter((x) => matches(x, { ...p.picks, [main]: v }));
        const u = this.ui.duel.get().update!;
        const keyOf = fit.flatMap((x) => dropKeys(x.action, u.view.you))[0] ?? `pick:${v}`;
        this.resolveHit({ key: keyOf, plans: fit }, src);
      } else this.popupPick(main, v);
      return;
    }
    if (key === "ArrowLeft" || key === "ArrowRight") {
      handled();
      if (!opts.length) return;
      const cur = p.picks[main] !== undefined ? opts.indexOf(p.picks[main]!) : -1;
      const dir = key === "ArrowRight" ? 1 : -1;
      const next = cur < 0 ? (dir > 0 ? 0 : opts.length - 1) : (cur + dir + opts.length) % opts.length;
      this.popupPick(main, opts[next]!);
    }
  }
}
