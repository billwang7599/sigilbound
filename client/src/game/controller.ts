/** Glue: server updates → UI stores and the board; clicks → one of the server's legal actions. */
import type { Action, DuelUpdate, GameEvent } from "@sigilbound/engine";
import { describeEvent } from "../core/describe.js";
import { clickSlot, optionsFor, slotKey, slotsOf, type Selection, type Slot } from "../core/selection.js";
import type { Net } from "../net/net.js";
import type { LogLine, UiActions, UiState } from "../ui/state.js";
import type { BoardView } from "../visuals/board.js";

let logId = 0;

export class Controller implements UiActions {
  private board: BoardView | null = null;
  private boardReady: Promise<BoardView> | null = null;

  constructor(
    private readonly ui: UiState,
    private readonly net: Net,
    private readonly makeBoard: (host: HTMLElement, c: Controller) => Promise<BoardView>,
  ) {}

  // ---- from the server ----

  onUpdate(u: DuelUpdate): void {
    const d = this.ui.duel.get();
    const prev = d.update;
    if (prev && prev.duelId !== u.duelId) this.ui.duel.set({ log: [] });
    const me = u.view.you;
    const lines: LogLine[] = u.events.flatMap((e) => {
      const text = describeEvent(e, me);
      if (!text) return [];
      const tone: LogLine["tone"] = e.t === "turn" ? "turn" : "p" in e ? (e.p === me ? "mine" : "theirs") : "plain";
      return [{ id: ++logId, text: text[0]!.toUpperCase() + text.slice(1), tone }];
    });
    const log = [...(prev && prev.duelId !== u.duelId ? [] : d.log), ...lines].slice(-200);
    // Keep a selection only if it still leads somewhere.
    const sel = d.selection && optionsFor(d.selection, u.legal).length ? d.selection : null;
    this.ui.duel.set({
      update: u, log, selection: sel, narrowed: null, hoverAction: null,
      mulligan: u.view.state.step === "mulligan" ? d.mulligan : [],
      windowEndsAt: u.window ? performance.now() + u.window.msLeft : null,
    });
    this.ui.app.set({ screen: "duel", error: null, hasSaved: true });
    this.board?.render(u, this.highlights());
    if (u.events.length) this.board?.play(u.events as GameEvent[], prev?.view.state ?? null, me);
  }

  onError(message: string): void {
    if (message === "duel not found") this.ui.app.set({ screen: "title", hasSaved: false });
    this.ui.app.set({ error: message });
  }

  onStatus(connected: boolean): void {
    this.ui.app.set({ connected });
    // Back online mid-duel: pick up where we were.
    if (connected && this.ui.app.get().screen === "duel") this.resume();
  }

  // ---- from the UI ----

  newDuel(deck: "ember_rush" | "deepwall"): void {
    this.ui.duel.set({ update: null, log: [], selection: null, narrowed: null, mulligan: [] });
    this.net.send({ t: "new", deck });
  }

  resume(): void {
    const saved = this.net.saved();
    if (saved) this.net.send({ t: "resume", ...saved });
  }

  leave(): void {
    this.net.forget();
    this.ui.app.set({ screen: "title", hasSaved: false });
    this.ui.duel.set({ update: null, log: [] });
  }

  act(a: Action): void {
    const u = this.ui.duel.get().update;
    if (!u) return;
    this.ui.duel.set({ selection: null, narrowed: null, hoverAction: null });
    this.net.send({ t: "act", duelId: u.duelId, action: a });
  }

  select(sel: Selection | null): void {
    this.ui.duel.set({ selection: sel, narrowed: null });
    this.refreshBoard();
  }

  clickSlot(slot: Slot): void {
    const d = this.ui.duel.get();
    const u = d.update;
    if (!u) return;
    const options = d.narrowed ?? (d.selection ? optionsFor(d.selection, u.legal) : []);
    const pick = clickSlot(slot, d.selection, options, u.legal, u.view.you);
    if (pick.send) this.act(pick.send);
    else if (pick.narrow) this.ui.duel.set({ narrowed: pick.narrow });
    else this.select(pick.select ?? null);
  }

  hover(h: import("../ui/state.js").Hovered | null): void {
    this.ui.duel.set({ hovered: h });
  }

  hoverAction(a: Action | null): void {
    this.ui.duel.set({ hoverAction: a });
    this.refreshBoard();
  }

  toggleMulligan(uid: number): void {
    const m = this.ui.duel.get().mulligan;
    this.ui.duel.set({ mulligan: m.includes(uid) ? m.filter((x) => x !== uid) : [...m, uid] });
  }

  attachBoard(host: HTMLElement | null): void {
    if (!host) return;
    if (!this.boardReady) {
      this.boardReady = this.makeBoard(host, this).then((b) => {
        this.board = b;
        const u = this.ui.duel.get().update;
        if (u) b.render(u, this.highlights());
        return b;
      });
    } else {
      void this.boardReady.then((b) => b.mount(host));
    }
  }

  // ---- helpers ----

  /** Slots to light up: where the current selection (or hovered menu item) can go. */
  highlights(): { targets: Set<string>; selected: string | null; focus: Set<string> } {
    const d = this.ui.duel.get();
    const u = d.update;
    const targets = new Set<string>(), focus = new Set<string>();
    let selected: string | null = null;
    if (u && d.selection) {
      const me = u.view.you;
      const options = d.narrowed ?? optionsFor(d.selection, u.legal);
      for (const a of options) for (const s of slotsOf(a, me)) targets.add(slotKey(s));
      if (d.selection.kind === "monster") selected = slotKey({ side: "me", row: "monster", lane: d.selection.lane });
      if (d.selection.kind === "spell") selected = slotKey({ side: "me", row: "spell", lane: d.selection.lane });
      if (d.hoverAction) for (const s of slotsOf(d.hoverAction, me)) focus.add(slotKey(s));
    }
    return { targets, selected, focus };
  }

  private refreshBoard(): void {
    const u = this.ui.duel.get().update;
    if (u) this.board?.render(u, this.highlights());
  }
}
