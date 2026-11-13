/** What one player is allowed to know. The server sends only this; the AI plays only from this. */
import { clone } from "./engine.js";
import { other } from "./stats.js";
import type { CardRef, GameEvent, GameState, PlayerId } from "./types.js";

export interface PlayerView {
  you: PlayerId;
  /** Same shape as GameState, with hidden cards as `{ uid: <negative>, id: "hidden" }` and no RNG seed. */
  state: GameState;
}

export function viewFor(state: GameState, viewer: PlayerId): PlayerView {
  const s = clone(state);
  s.rng = 0;
  let n = 0;
  const hide = (_c: CardRef): CardRef => ({ uid: -++n, id: "hidden" });
  for (const p of [0, 1] as PlayerId[]) {
    const pl = s.players[p];
    pl.deck = pl.deck.map(hide); // nobody sees deck order, not even its owner
    if (p === viewer) continue;
    pl.hand = pl.hand.map(hide);
    pl.sigils = pl.sigils.map((sg) => ({ ...hide(sg), tapped: sg.tapped }));
    pl.spells = pl.spells.map((sp) => (sp ? { ...hide(sp), setTurn: sp.setTurn } : null));
  }
  return { you: viewer, state: s };
}

/** Strips what `viewer` shouldn't learn from a batch of events (the opponent's draws, binds and set spells). */
export function eventsFor(events: GameEvent[], viewer: PlayerId): GameEvent[] {
  return events.map((e) => {
    if ((e.t === "draw" || e.t === "bind" || e.t === "set") && e.p === other(viewer)) {
      const { card: _card, ...rest } = e as GameEvent & { card?: string; uid?: number };
      if ("uid" in rest) delete (rest as { uid?: number }).uid;
      return rest as GameEvent;
    }
    return e;
  });
}
