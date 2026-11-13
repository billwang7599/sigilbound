import type { Action, CardRef, DeckChoice, DuelUpdate } from "@sigilbound/engine";
import type { Dim, Plan, Source, Verb } from "../core/intent.js";
import { Store } from "./store.js";

export interface LogLine {
  id: number;
  text: string;
  tone: "mine" | "theirs" | "turn" | "plain";
  /** The card the line is about (clicking the line shows it). */
  card?: string;
  /** A play (summon, spell, Ambush, bind, set): drawn stronger than its effects. */
  play?: boolean;
}

/** The rival's play, shown big over the board before it goes where it's going. */
export interface Reveal {
  n: number;
  id: string;
  caption: string;
  /** Board keys (visuals/board.ts) it flies from and to. */
  from: string;
  to: string;
  phase: "in" | "out";
}

/** How the rival's moves play back. */
export type Playback = "normal" | "decision" | "turn";

export interface Settings {
  /** Fast-forward the rival's turns until you have a decision. */
  autoSkip: boolean;
  aiSpeed: "normal" | "fast";
}

/** What a card popup shows: something with choices (a Source), or just a card to read. */
export type PopupSrc =
  | Source
  | { kind: "enemy"; lane: number }
  | { kind: "card"; id: string; note?: string };

export interface Popup {
  src: PopupSrc;
  /** The verb whose choices are showing (null: just the buttons). */
  verb: Verb | null;
  picks: Partial<Record<Dim, string>>;
  /** Pick order, so Esc can undo the last one. */
  order: Dim[];
  /** Index of the keyboard-highlighted option per dim. */
  cursor: Partial<Record<Dim, number>>;
}

/** The thing under the pointer on the board: a slot key, and the keyword badge if the pointer is on one. */
export interface Hover { key: string; kw: string | null }

/** After a drop on a monster slot with both positions legal: ask attack or defense right on the slot. */
export interface Ask {
  uid: number;
  key: string;
  plans: Plan[];
  choice: "atk" | "def";
}

export type Focus = { area: "hand"; index: number } | { area: "board"; lane: number };

export interface AppState {
  screen: "title" | "duel";
  connected: boolean;
  error: string | null;
  hasSaved: boolean;
  /** A card popup outside a duel (deck lists on the title screen). */
  popup: Popup | null;
  /** The title screen's deck list. */
  deckList: DeckChoice | null;
}

export interface DuelState {
  /** The update the screen shows (animations may lag the newest one a little). */
  update: DuelUpdate | null;
  /** The hand as drawn: cards appear as their draw animation reaches them. */
  hand: CardRef[];
  /** Hand cards sent to the server and waiting for its answer (hidden meanwhile). */
  inFlight: number[];
  log: LogLine[];
  logOpen: boolean;
  /** The selected card and the choices it's offering (an action menu beside it). */
  popup: Popup | null;
  /** A card shown big for reading (I / Space, or clicking a card you can't act with). */
  inspect: PopupSrc | null;
  /** What the pointer is over on the board (shows a keyword info box beside it). */
  hover: Hover | null;
  /** A hand card hovered long enough to show its big preview. */
  handHover: number | null;
  reveal: Reveal | null;
  playback: Playback;
  settings: Settings;
  /** A short message, e.g. what the rival did while you skipped. */
  toast: { id: number; text: string } | null;
  ask: Ask | null;
  pile: { kind: "deck" } | { kind: "discard"; side: "me" | "opp" } | null;
  drag: { id: string; x: number; y: number; over: boolean } | null;
  focus: Focus | null;
  banner: { id: number; text: string; tone: "me" | "opp" | "attack" } | null;
  confirmEnd: number | null;
  help: boolean;
  mulligan: number[];
  /** When the open window's countdown ends (performance.now() ms). */
  windowEndsAt: number | null;
}

const SETTINGS_KEY = "sigilbound.settings";

export function loadSettings(): Settings {
  const fallback: Settings = { autoSkip: false, aiSpeed: "normal" };
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const v = JSON.parse(raw) as Partial<Settings>;
    return { autoSkip: v.autoSkip === true, aiSpeed: v.aiSpeed === "fast" ? "fast" : "normal" };
  } catch {
    return fallback;
  }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

export class UiState {
  readonly app = new Store<AppState>({ screen: "title", connected: false, error: null, hasSaved: false, popup: null, deckList: null });
  readonly duel = new Store<DuelState>({
    update: null, hand: [], inFlight: [], log: [], logOpen: false, popup: null, inspect: null, hover: null, handHover: null,
    reveal: null, playback: "normal", settings: loadSettings(), toast: null, ask: null, pile: null, drag: null,
    focus: null, banner: null, confirmEnd: null, help: false, mulligan: [], windowEndsAt: null,
  });
}

/** What the React side can ask the game to do. */
export interface UiActions {
  newDuel(deck: DeckChoice): void;
  resume(): void;
  leave(): void;
  act(a: Action): void;
  send(p: Plan, handUid?: number): void;
  openPopup(src: PopupSrc): void;
  /** Show a card big for reading, or close the reading view (null). */
  inspect(src: PopupSrc | null): void;
  hoverHand(uid: number | null): void;
  /** Skip the rival's playback: this move, until you must decide, or to the end of its turn. */
  skip(mode: "move" | "decision" | "turn"): void;
  setSettings(patch: Partial<Settings>): void;
  closePopup(): void;
  popupConfirm(): void;
  popupPlansOf(p: Popup): Plan[];
  boardRect(key: string): DOMRect | null;
  closePile(): void;
  openPile(p: DuelState["pile"]): void;
  setFocus(f: Focus | null): void;
  toggle(what: "help" | "logOpen"): void;
  cancelEnd(): void;
  showDeckList(deck: DeckChoice | null): void;
  popupPick(dim: Dim, value: string): void;
  popupVerb(verb: Verb | null): void;
  popupBack(): void;
  hint(keys: string[] | null): void;
  answerAsk(position: "atk" | "def" | null): void;
  handPointerDown(uid: number, e: { clientX: number; clientY: number; button: number }): void;
  toggleMulligan(uid: number): void;
  attachBoard(host: HTMLElement | null): void;
  endTurn(confirmed?: boolean): void;
}
