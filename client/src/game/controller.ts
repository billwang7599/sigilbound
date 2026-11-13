/**
 * Glue between the server, the board and the HUD.
 *
 * - Server updates go through a queue: each one's events animate in order on the board, then the board reconciles
 *   to that update's state, so updates never snap and the AI's moves play one at a time.
 * - Pointer and keyboard input become one of the server's legal actions (see core/intent.ts): drag a card onto the
 *   board, or click it for its popup and pick from the choices there.
 */
import { card, sameAction, type Action, type DeckChoice, type DuelUpdate, type GameEvent } from "@sigilbound/engine";
import { describeEvent } from "../core/describe.js";
import { diff, wanted } from "../core/reconcile.js";
import {
  dropKeys, dropMarks, groupByVerb, matches, openDims, optionsFor, plansAtDrop, plansFor, primaryVerb, remainingMoves, resolve,
  type Dim, type Plan, type Source, type Verb,
} from "../core/intent.js";
import type { Net } from "../net/net.js";
import type { DuelState, Focus, LogLine, Popup, PopupSrc, UiActions, UiState } from "../ui/state.js";
import type { BoardView } from "../visuals/board.js";

let logId = 0;
let bannerId = 0;

interface Queued { u: DuelUpdate; endsAt: number | null }

type Drag =
  | { kind: "hand"; uid: number; x0: number; y0: number; started: boolean; plans: Plan[]; hot: string | null }
  | { kind: "monster"; lane: number; x0: number; y0: number; started: boolean; plans: Plan[]; hot: string | null };

export class Controller implements UiActions {
  private board: BoardView | null = null;
  private boardReady: Promise<BoardView> | null = null;
  private queue: Queued[] = [];
  private busy = false;
  private followUp: Action | null = null;
  private drag: Drag | null = null;
  private hintKeys: string[] = [];

  constructor(
    private readonly ui: UiState,
    private readonly net: Net,
    private readonly makeBoard: (host: HTMLElement) => Promise<BoardView>,
  ) {
    window.addEventListener("keydown", (e) => this.onKey(e));
    window.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
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

  private async present({ u, endsAt }: Queued): Promise<void> {
    const d = this.ui.duel.get();
    const prev = d.update;
    const me = u.view.you;
    const fresh = !prev || prev.duelId !== u.duelId;
    const board = this.board ?? (this.boardReady ? await this.boardReady : null);
    if (fresh) board?.reset();
    const lines: LogLine[] = u.events.flatMap((e) => {
      const text = describeEvent(e, me);
      if (!text) return [];
      const tone: LogLine["tone"] = e.t === "turn" ? "turn" : "p" in e ? (e.p === me ? "mine" : "theirs") : "plain";
      return [{ id: ++logId, text: text[0]!.toUpperCase() + text.slice(1), tone }];
    });
    const log = [...(fresh ? [] : d.log), ...lines].slice(-200);
    const s = u.view.state;
    const newHand = s.players[me].hand;
    const drawn = new Set(u.events.flatMap((e) => (e.t === "draw" && e.p === me && e.uid !== undefined ? [e.uid] : [])));
    const had = new Set((fresh ? [] : d.hand).map((c) => c.uid));
    const hand = newHand.filter((c) => had.has(c.uid) || !drawn.has(c.uid));
    const popup = d.popup && this.popupStillValid(d.popup, u) ? d.popup : null;
    this.ui.duel.set({
      update: u, log, hand, popup,
      inFlight: d.inFlight.filter((uid) => newHand.some((c) => c.uid === uid)),
      mulligan: s.step === "mulligan" ? d.mulligan : [],
      windowEndsAt: endsAt,
      ask: d.ask && newHand.some((c) => c.uid === d.ask!.uid) ? d.ask : null,
      confirmEnd: null,
      ...(fresh ? { pile: null, focus: null, banner: null, logOpen: false } : {}),
    });
    if (board) {
      const lag = this.queue.length >= 2 || this.queue.some((q) => q.u.window?.responder === q.u.view.you);
      board.speed = fresh ? 0 : lag ? 0.3 : 1;
      board.tapSigils(s, me);
      for (const e of u.events as GameEvent[]) {
        if (e.t === "turn" && !fresh) {
          this.ui.duel.set({ banner: { id: ++bannerId, text: e.p === me ? "Your turn" : "Rival's turn", tone: e.p === me ? "me" : "opp" } });
          await board.wait(700);
        } else if (e.t === "attackStep" && !fresh) {
          this.ui.duel.set({ banner: { id: ++bannerId, text: e.p === me ? "Attack!" : "Rival attacks!", tone: "attack" } });
          await board.wait(500);
        }
        await board.animate(e, s, me);
        if (e.t === "draw" && e.p === me && e.uid !== undefined) {
          const shown = new Set(this.ui.duel.get().hand.map((c) => c.uid));
          shown.add(e.uid);
          this.ui.duel.set({ hand: newHand.filter((c) => shown.has(c.uid)) });
        }
      }
      board.speed = 1;
      board.sync(s, me);
      if (!fresh) await board.wait(this.queue.length ? 60 : 120);
    }
    this.ui.duel.set({ hand: newHand });
    this.refreshMarks();
    // An attack picked during the Main step: now that the attack step has started, send it.
    if (this.followUp) {
      const f = this.followUp;
      this.followUp = null;
      if (u.legal.some((a) => sameAction(a, f))) this.act(f);
    }
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
    this.ui.duel.set({ update: null, hand: [], log: [], popup: null, ask: null, pile: null, mulligan: [], inFlight: [] });
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
    this.ui.duel.set({ update: null, hand: [], log: [], popup: null, pile: null });
  }

  act(a: Action): void {
    const u = this.ui.duel.get().update;
    if (!u) return;
    this.net.send({ t: "act", duelId: u.duelId, action: a });
  }

  send(p: Plan, handUid?: number): void {
    const d = this.ui.duel.get();
    this.ui.duel.set({
      popup: null, ask: null, inFlight: handUid !== undefined ? [...d.inFlight, handUid] : d.inFlight,
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
    this.ui.duel.set({ pile: p });
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

  // ---- popups ----

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

  openPopup(src: PopupSrc): void {
    const u = this.ui.duel.get().update;
    let verb: Verb | null = null;
    const source = this.sourceOf(src);
    if (u && source && this.popupInDuel()) verb = primaryVerb(groupByVerb(plansFor(source, u)), source);
    this.setPopup({ src, verb, picks: {}, order: [], cursor: {} });
  }

  closePopup(): void {
    this.hintKeys = [];
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
      // Abyssal Leviathan: which monsters to return is chosen in the popup.
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
    } else if (d.popup && d.popup.verb) {
      const plans = this.verbPlans(d.popup).filter((p) => matches(p, d.popup!.picks));
      targets = dropMarks(plans, s, me);
      const done = resolve(this.verbPlans(d.popup), d.popup.picks);
      if (done) for (const k of dropKeys(done.action, me)) hot.add(k);
    }
    if (d.ask) hot.add(d.ask.key);
    let focus: string | null = null;
    if (d.focus?.area === "board") focus = `me:monster:${d.focus.lane}`;
    else if (d.popup?.src.kind === "monster") focus = `me:monster:${d.popup.src.lane}`;
    else if (d.popup?.src.kind === "enemy") focus = `opp:monster:${d.popup.src.lane}`;
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
      const u = this.ui.duel.get().update;
      if (!u) return;
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
      if (this.drag) return;
      const keys = b.keysAt(e.clientX, e.clientY);
      const clickable = keys.some((k) => /^(me|opp):monster|^me:spell|^sigil:me|^deck:me|^discard/.test(k));
      c.style.cursor = clickable ? "pointer" : "default";
    });
  }

  private onPointerMove(e: PointerEvent): void {
    const dr = this.drag;
    const b = this.board;
    if (!dr || !b) return;
    if (!dr.started) {
      if (Math.hypot(e.clientX - dr.x0, e.clientY - dr.y0) < 6) return;
      dr.started = true;
      this.ui.duel.set({ popup: null, ask: null, focus: null });
    }
    const u = this.ui.duel.get().update!;
    const hit = plansAtDrop(dr.plans, b.keysAt(e.clientX, e.clientY), u.view.you, u.view.state);
    dr.hot = hit?.key ?? null;
    if (dr.kind === "hand") {
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
      if (dr.kind === "hand") this.openPopup({ kind: "hand", uid: dr.uid });
      else this.openPopup({ kind: "monster", lane: dr.lane });
      return;
    }
    const hit = plansAtDrop(dr.plans, b.keysAt(e.clientX, e.clientY), u.view.you, u.view.state);
    this.refreshMarks();
    if (!hit) return;
    if (dr.kind === "monster") {
      this.send(hit.plans[0]!);
      return;
    }
    const summons = hit.plans.filter((p) => p.action.type === "summon");
    if (summons.length && summons.length === hit.plans.length) {
      const positions = new Set(summons.map((p) => (p.action as { position: string }).position));
      if (positions.size > 1) {
        this.ui.duel.set({ ask: { uid: dr.uid, key: hit.key, plans: summons, choice: "atk" } });
        this.refreshMarks();
        return;
      }
      this.answerAskDirect(dr.uid, hit.key, summons);
      return;
    }
    if (hit.plans.length === 1) this.send(hit.plans[0]!, dr.uid);
    else {
      const verb = groupByVerb(hit.plans).keys().next().value ?? null;
      this.ui.duel.set({ popup: { src: { kind: "hand", uid: dr.uid }, verb, picks: {}, order: [], cursor: {} } });
      this.refreshMarks();
    }
  }

  private answerAskDirect(uid: number, key: string, plans: Plan[]): void {
    const pos = (plans[0]!.action as { position: "atk" | "def" }).position;
    this.ui.duel.set({ ask: { uid, key, plans, choice: pos } });
    this.answerAsk(pos);
  }

  private boardClick(keys: string[]): void {
    const u = this.ui.duel.get().update;
    if (!u) return;
    const s = u.view.state, me = u.view.you;
    const opp = me === 0 ? 1 : 0;
    for (const k of keys) {
      const [a, b, c] = k.split(":");
      if (a === "opp" && b === "monster" && s.players[opp].monsters[Number(c)]) return this.openPopup({ kind: "enemy", lane: Number(c) });
      if (a === "me" && b === "spell" && s.players[me].spells[Number(c)]) return this.openPopup({ kind: "spell", lane: Number(c) });
      if (a === "sigil" && b === "me") {
        const sg = s.players[me].sigils[Number(c)];
        if (sg && sg.id !== "hidden") return this.openPopup({ kind: "card", id: sg.id, note: "Bound as a Sigil. It's face down: only you know which card it is." });
      }
      if (a === "deck" && b === "me") return this.openPile({ kind: "deck" });
      if (a === "discard") return this.openPile({ kind: "discard", side: b as "me" | "opp" });
    }
  }

  // ---- keyboard ----

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key;
    const app = this.ui.app.get();
    const d = this.ui.duel.get();
    const handled = () => e.preventDefault();

    if (app.screen === "title") {
      if (app.popup) {
        if (key === "Escape" || key === "Enter") { handled(); this.closePopup(); }
        return;
      }
      if (app.deckList && key === "Escape") { handled(); this.showDeckList(null); }
      return;
    }
    const u = d.update;
    if (!u) return;
    const me = u.view.you;
    const s = u.view.state;

    if (d.help) {
      if (key === "Escape" || key === "?") { handled(); this.toggle("help"); }
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
    if (d.popup) {
      this.popupKey(e, d.popup);
      return;
    }
    if (d.pile) {
      if (key === "Escape") { handled(); this.closePile(); }
      return;
    }
    if (key === "?") { handled(); this.toggle("help"); return; }
    if (key === "l" || key === "L") { handled(); this.toggle("logOpen"); return; }
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
      if (hand.length) this.setFocus({ area: "hand", index: 0 });
      return;
    }
    if (key === "Enter" || key === " ") {
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
    if (key === "Escape") { handled(); this.popupBack(); return; }
    if (key === "b" || key === "B") { if (groups.has("bind")) { handled(); this.popupVerb("bind"); } return; }
    if (key === "s" || key === "S") { if (groups.has("position")) { handled(); this.popupVerb("position"); } return; }
    if (key === "Enter" || key === " ") {
      handled();
      if (p.verb && resolve(plans, p.picks)) this.popupConfirm();
      else if (!p.verb && groups.has("attack")) this.popupVerb("attack");
      else if (!p.verb && groups.size === 0) this.closePopup();
      return;
    }
    if (!p.verb) return;
    if (dims.includes("position")) {
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
      if (v !== undefined && opts.includes(v)) this.popupPick(main, v);
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

/** For components that need a card name for a uid in hand. */
export function handCardId(u: DuelUpdate, uid: number): string | null {
  return u.view.state.players[u.view.you].hand.find((c) => c.uid === uid)?.id ?? null;
}

export const cardName = (id: string) => card(id).name;
