/** Messages between the browser and the game server. Types only; the server validates incoming ones with Zod. */
import type { PlayerView } from "./view.js";
import type { Action, GameEvent } from "./types.js";

export type DeckChoice = "ember_rush" | "deepwall";

export type ClientMessage =
  | { t: "new"; deck: DeckChoice }
  | { t: "resume"; duelId: string; token: string }
  | { t: "act"; duelId: string; action: Action }
  /**
   * Playback only: drop the AI's "thinking" delay until the human next has a decision to make ("decision") or until
   * the AI's turn ends ("turn"; it still stops for the human's Ambush windows, which are never auto-passed).
   */
  | { t: "hurry"; duelId: string; until: "decision" | "turn" };

export interface DuelUpdate {
  t: "duel";
  duelId: string;
  token: string;
  view: PlayerView;
  /** What happened since the last update, already redacted for this player. */
  events: GameEvent[];
  /** Everything this player may do right now (empty when it isn't their move). */
  legal: Action[];
  /** An open Ambush window: whose it is and how long is left, in ms. */
  window: { responder: number; msLeft: number; seq: number } | null;
  /** The AI is about to move (purely cosmetic). */
  aiThinking: boolean;
}

export type ServerMessage = DuelUpdate | { t: "error"; message: string };

/** Ambush windows close on their own after this long (plan/architecture.md). */
export const WINDOW_MS = 3000;
