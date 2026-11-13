import type { Action, DeckChoice, DuelUpdate } from "@sigilbound/engine";
import type { Selection, Slot } from "../core/selection.js";
import { Store } from "./store.js";

export interface LogLine {
  id: number;
  text: string;
  tone: "mine" | "theirs" | "turn" | "plain";
}

/** A card the player is looking at; side/lane when it's on the board (for live stats). */
export interface Hovered {
  id: string;
  side?: "me" | "opp";
  lane?: number;
}

export interface AppState {
  screen: "title" | "duel";
  connected: boolean;
  error: string | null;
  hasSaved: boolean;
}

export interface DuelState {
  update: DuelUpdate | null;
  log: LogLine[];
  selection: Selection | null;
  /** A narrowed menu after an ambiguous click. */
  narrowed: Action[] | null;
  hovered: Hovered | null;
  hoverAction: Action | null;
  /** Cards marked to send back at the mulligan. */
  mulligan: number[];
  /** When the open window's countdown ends (performance.now() ms). */
  windowEndsAt: number | null;
}

export class UiState {
  readonly app = new Store<AppState>({ screen: "title", connected: false, error: null, hasSaved: false });
  readonly duel = new Store<DuelState>({
    update: null, log: [], selection: null, narrowed: null, hovered: null, hoverAction: null, mulligan: [],
    windowEndsAt: null,
  });
}

/** What the React side can ask the game to do. */
export interface UiActions {
  newDuel(deck: DeckChoice): void;
  resume(): void;
  leave(): void;
  act(a: Action): void;
  select(sel: Selection | null): void;
  clickSlot(slot: Slot): void;
  hover(h: Hovered | null): void;
  hoverAction(a: Action | null): void;
  toggleMulligan(uid: number): void;
  attachBoard(host: HTMLElement | null): void;
}
