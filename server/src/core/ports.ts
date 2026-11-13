/** Everything core needs from the outside world. Outlets (ws/, api/, db/) implement these; main.ts wires them. */
import type { GameState, PlayerId, ServerMessage } from "@sigilbound/engine";

export interface DuelRecord {
  id: string;
  /** The human's secret for resuming this duel. */
  token: string;
  state: GameState;
  human: PlayerId;
  ai: PlayerId;
  /** When the open Ambush window closes (Clock.now() ms), if one is open. */
  windowDeadline: number | null;
  createdAt: number;
}

export interface DuelStore {
  get(id: string): DuelRecord | undefined;
  save(duel: DuelRecord): void;
  delete(id: string): void;
  list(): DuelRecord[];
}

export interface Clock {
  now(): number;
  /** Run `fn` after `ms`; returns a cancel function. */
  after(ms: number, fn: () => void): () => void;
}

/** Delivers messages to whoever is watching a duel (the human's socket). */
export interface PlayerLink {
  send(duelId: string, message: ServerMessage): void;
}

export interface Ids {
  duelId(): string;
  token(): string;
  seed(): number;
}

export interface Ports {
  store: DuelStore;
  clock: Clock;
  link: PlayerLink;
  ids: Ids;
}
