/** What one player is allowed to know. The server sends only this; the AI plays only from this. */
import { card } from "./cards.js";
import { clone } from "./engine.js";
import { other } from "./stats.js";
import type { CardRef, GameEvent, GameState, PlayerId } from "./types.js";

export interface PlayerView {
  you: PlayerId;
  /** Same shape as GameState, with hidden cards as `{ uid: <negative>, id: "hidden" }` and no RNG seed. */
  state: GameState;
  /**
   * The cards left in your own deck as a multiset: card ids sorted by cost then name, never in draw order. The
   * opponent's deck is only a count (its length in `state`).
   */
  deckList: string[];
}

export function viewFor(state: GameState, viewer: PlayerId): PlayerView {
  const s = clone(state);
  const deckList = state.players[viewer].deck.map((c) => c.id).sort(byCostThenName);
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
  return { you: viewer, state: s, deckList };
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

function byCostThenName(a: string, b: string): number {
  const ca = card(a), cb = card(b);
  return ca.cost - cb.cost || ca.name.localeCompare(cb.name);
}
