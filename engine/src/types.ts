import type { CrestId, FieldId } from "./cards.js";

export type PlayerId = 0 | 1;
export type Position = "atk" | "def";
export const LANES = [0, 1, 2] as const;

/** A card instance. `id` is "hidden" (and `uid` negative) in a view when the viewer can't see it. */
export interface CardRef {
  uid: number;
  id: string;
}

export interface Monster {
  uid: number;
  id: string;
  position: Position;
  /** Battle damage this turn (defense position only). Clears at the end of every turn. */
  damage: number;
  /** The turn number it entered play. */
  entered: number;
  posChanged: boolean;
  attacked: boolean;
  /** "This turn" modifiers; clear at the end of the turn. */
  atkTurn: number;
  defTurn: number;
  /** Stone crest: +DEF until the start of its owner's next turn. */
  defStone: number;
  /** Awaken bonus, kept while it stays on the board. */
  atkPerm: number;
  defPerm: number;
}

export interface SetSpell {
  uid: number;
  id: string;
  setTurn: number;
}

export interface Sigil {
  uid: number;
  id: string;
  tapped: boolean;
}

export interface PlayerState {
  lp: number;
  deck: CardRef[];
  hand: CardRef[];
  discard: CardRef[];
  sigils: Sigil[];
  monsters: (Monster | null)[];
  spells: (SetSpell | null)[];
  crest: CrestId;
  home: FieldId;
  deckName: string;
  bound: boolean;
  crestUsed: boolean;
  moved: boolean;
  ambushUsed: boolean;
  mulliganDone: boolean;
}

export type AttackTarget = { kind: "direct" } | { kind: "monster"; lane: number };

/** Waiting for the non-turn player to play an Ambush or pass. The engine has no clock; the server times it. */
export type PendingWindow =
  | { kind: "attack"; responder: PlayerId; attacker: number; attackerUid: number; target: AttackTarget }
  | { kind: "destroyed"; responder: PlayerId; attacker: number; attackerUid: number; lane: number };

export type Step = "mulligan" | "main" | "attack" | "over";

export interface GameState {
  v: 1;
  rng: number;
  nextUid: number;
  /** Counts every player turn; the first player's first turn is 1. */
  turn: number;
  active: PlayerId;
  first: PlayerId;
  step: Step;
  players: [PlayerState, PlayerState];
  /** Lane fields: [first player's home, center place, second player's home]. */
  fields: FieldId[];
  window: PendingWindow | null;
  /** Bumps every time a window opens, so a timer can tell windows apart. */
  windowSeq: number;
  winner: PlayerId | null;
  endReason: string | null;
}

export type Action =
  | { type: "mulligan"; uids: number[] }
  | { type: "bind"; uid: number }
  | { type: "summon"; uid: number; lane: number; position: Position; targets?: number[] }
  | { type: "position"; lane: number }
  | { type: "cast"; uid: number; target?: { side: PlayerId; lane: number } }
  | { type: "set"; uid: number; lane: number }
  | { type: "flip"; lane: number; uid?: number; position?: Position }
  | { type: "crest"; lane?: number; to?: number }
  | { type: "move"; from: number; to: number }
  | { type: "attackStep" }
  | { type: "attack"; lane: number; target: AttackTarget }
  | { type: "endTurn" }
  | { type: "ambush"; uid: number }
  | { type: "pass" }
  | { type: "concede" };

/** What happened, for logs and animation. `card` is removed by `eventsFor` when the viewer shouldn't see it. */
export type GameEvent =
  | { t: "start"; first: PlayerId; fields: FieldId[] }
  | { t: "mulligan"; p: PlayerId; count: number }
  | { t: "turn"; p: PlayerId; turn: number }
  | { t: "draw"; p: PlayerId; card?: string; uid?: number }
  | { t: "burnDraw"; p: PlayerId; card: string }
  | { t: "emptyDeck"; p: PlayerId; lp: number }
  | { t: "bind"; p: PlayerId; card?: string }
  | { t: "summon"; p: PlayerId; card: string; lane: number; position: Position; awakened: boolean }
  | { t: "replace"; p: PlayerId; card: string; lane: number }
  | { t: "position"; p: PlayerId; lane: number; position: Position }
  | { t: "move"; p: PlayerId; from: number; to: number; swap: boolean }
  | { t: "cast"; p: PlayerId; card: string }
  | { t: "set"; p: PlayerId; lane: number; card?: string }
  | { t: "flip"; p: PlayerId; lane: number; card: string }
  | { t: "crest"; p: PlayerId; crest: CrestId; lane?: number }
  | { t: "attackStep"; p: PlayerId }
  | { t: "attack"; p: PlayerId; lane: number; target: AttackTarget; atk: number }
  | { t: "window"; responder: PlayerId; kind: PendingWindow["kind"] }
  | { t: "ambush"; p: PlayerId; card: string }
  | { t: "pass"; p: PlayerId }
  | { t: "cancelled"; p: PlayerId; lane: number }
  | { t: "lp"; p: PlayerId; delta: number; lp: number; reason: string }
  | { t: "damage"; p: PlayerId; lane: number; amount: number; total: number }
  | { t: "destroyed"; p: PlayerId; lane: number; card: string; cause: "battle" | "effect" }
  | { t: "bounce"; p: PlayerId; lane: number; card: string }
  | { t: "buff"; p: PlayerId; lane: number; atk: number; def: number }
  | { t: "revive"; p: PlayerId; lane: number; card: string }
  | { t: "restDraw"; p: PlayerId }
  | { t: "endTurn"; p: PlayerId }
  | { t: "gameOver"; winner: PlayerId; reason: string };

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

export class IllegalActionError extends Error {}
