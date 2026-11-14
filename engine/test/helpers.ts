import {
  apply, createGame, DECKS, type Action, type GameEvent, type GameState, type Monster, type PlayerId, type Position,
} from "../src/index.js";

/** A game past the mulligan: player 0's main step on turn 3, empty boards and hands, 5 Sigils each, plain lanes. */
export function blank(): GameState {
  const s = createGame({ seed: 7, decks: [DECKS.ember_rush!, DECKS.deepwall!], first: 0 }).state;
  s.step = "main";
  s.turn = 3;
  s.active = 0;
  s.fields = [null, null, null];
  for (const pl of s.players) {
    pl.deck.push(...pl.hand);
    pl.hand = [];
    pl.mulliganDone = true;
    for (let i = 0; i < 5; i++) {
      const c = pl.deck.pop()!;
      pl.sigils.push({ uid: c.uid, id: c.id, tapped: false });
    }
  }
  return s;
}

let uid = 1000;

export function put(
  s: GameState, p: PlayerId, lane: number, id: string, position: Position = "atk", extra: Partial<Monster> = {},
): Monster {
  const m: Monster = {
    uid: uid++, id, position, damage: 0, entered: 1, posChanged: false, attacked: false,
    atkTurn: 0, defTurn: 0, defStone: 0, atkPerm: 0, defPerm: 0, ...extra,
  };
  s.players[p].monsters[lane] = m;
  return m;
}

export function give(s: GameState, p: PlayerId, id: string): number {
  const u = uid++;
  // Take a card out of the deck so the 30-card total holds.
  s.players[p].deck.pop();
  s.players[p].hand.push({ uid: u, id });
  return u;
}

export function setSigils(s: GameState, p: PlayerId, n: number): void {
  const pl = s.players[p];
  while (pl.sigils.length > n) pl.deck.push(pl.sigils.pop()!);
  while (pl.sigils.length < n) {
    const c = pl.deck.pop()!;
    pl.sigils.push({ uid: c.uid, id: c.id, tapped: false });
  }
}

export function run(s: GameState, ...steps: [PlayerId, Action][]): { state: GameState; events: GameEvent[] } {
  let state = s;
  const events: GameEvent[] = [];
  for (const [p, a] of steps) {
    const r = apply(state, p, a);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/** Attack step for player 0 with the opponent unable to Ambush (no untapped Sigils), so battles resolve at once. */
export function toAttack(s: GameState): GameState {
  for (const sg of s.players[1].sigils) sg.tapped = true;
  return apply(s, 0, { type: "attackStep" }).state;
}
