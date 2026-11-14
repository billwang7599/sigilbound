/**
 * Keyboard focus and menu navigation (pure, so it's tested without a browser).
 *
 * Focus is a cursor: a hand card, or an occupied slot on one of the board rows. Going up from the hand: your spell
 * row, your monsters, then the rival's monsters (empty rows are skipped). Selection is separate: a selected card has
 * its action menu open, and inside a menu the arrows move a cursor over its options (`menuItems`). Below the hand
 * is one more stop: the Deck button (Space lists what's left in your deck), and → from there is your Crest button.
 */
import type { GameState, PlayerId } from "@sigilbound/engine";
import { groupByVerb, openDims, optionsFor, resolve, type Dim, type Plan, type Verb } from "./intent.js";

/** Board rows, bottom to top. */
export type Row = "spell" | "me" | "opp";
export const ROWS_UP: Row[] = ["spell", "me", "opp"];

export type Focus = { area: "hand"; index: number } | { area: "board"; row: Row; lane: number } | { area: "deck" } | { area: "crest" };

/** What's on screen to move over: the hand's size and which slots of each row hold a card. */
export interface Field { hand: number; rows: Record<Row, boolean[]> }

export function fieldOf(s: GameState, me: PlayerId, hand: number): Field {
  const opp = me === 0 ? 1 : 0;
  return {
    hand,
    rows: {
      spell: s.players[me].spells.map((x) => !!x),
      me: s.players[me].monsters.map((x) => !!x),
      opp: s.players[opp].monsters.map((x) => !!x),
    },
  };
}

const occupied = (field: Field, row: Row) => field.rows[row].flatMap((on, l) => (on ? [l] : []));

/** The occupied lane in `row` nearest to `lane` (ties go left), or null. */
function nearestLane(field: Field, row: Row, lane: number): number | null {
  const ls = occupied(field, row);
  if (!ls.length) return null;
  return ls.reduce((best, l) => (Math.abs(l - lane) < Math.abs(best - lane) ? l : best));
}

/** The hand card's rough lane, so going up from the hand lands above it. */
function laneOver(index: number, hand: number, lanes: number): number {
  if (hand <= 1) return Math.floor(lanes / 2);
  return Math.round((index / (hand - 1)) * (lanes - 1));
}

/** Keeps focus on something that exists: after a play, a death or a turn change it moves to the nearest card. */
export function normalizeFocus(f: Focus | null, field: Field): Focus | null {
  if (!f || f.area === "deck" || f.area === "crest") return f;
  if (f.area === "hand") {
    if (field.hand > 0) return f.index < field.hand ? f : { area: "hand", index: field.hand - 1 };
    return firstRowFrom(field, 0, 1);
  }
  const lane = nearestLane(field, f.row, f.lane);
  if (lane !== null) return lane === f.lane ? f : { ...f, lane };
  // Its row emptied: the next row down, else up, else the hand.
  const at = ROWS_UP.indexOf(f.row);
  for (let i = at - 1; i >= 0; i--) { const l = nearestLane(field, ROWS_UP[i]!, f.lane); if (l !== null) return { area: "board", row: ROWS_UP[i]!, lane: l }; }
  if (field.hand) return { area: "hand", index: 0 };
  for (let i = at + 1; i < ROWS_UP.length; i++) { const l = nearestLane(field, ROWS_UP[i]!, f.lane); if (l !== null) return { area: "board", row: ROWS_UP[i]!, lane: l }; }
  return null;
}

function firstRowFrom(field: Field, from: number, lane: number): Focus | null {
  for (let i = from; i < ROWS_UP.length; i++) {
    const l = nearestLane(field, ROWS_UP[i]!, lane);
    if (l !== null) return { area: "board", row: ROWS_UP[i]!, lane: l };
  }
  return null;
}

export type Dir = "left" | "right" | "up" | "down";

/** One arrow press. With no focus yet, any arrow starts on the hand (or the board if the hand is empty). */
export function moveFocus(f: Focus | null, dir: Dir, field: Field): Focus | null {
  const cur = normalizeFocus(f, field);
  if (!cur) {
    if (field.hand) return { area: "hand", index: dir === "left" ? field.hand - 1 : 0 };
    return firstRowFrom(field, 0, 1);
  }
  const lanes = field.rows.me.length;
  if (cur.area === "crest") {
    if (dir === "left") return { area: "deck" };
    if (dir !== "up") return cur;
    return field.hand ? { area: "hand", index: field.hand - 1 } : firstRowFrom(field, 0, 1) ?? cur;
  }
  if (cur.area === "deck") {
    if (dir === "right") return { area: "crest" };
    if (dir !== "up") return cur;
    return field.hand ? { area: "hand", index: 0 } : firstRowFrom(field, 0, 1) ?? cur;
  }
  if (cur.area === "hand") {
    const n = field.hand;
    if (dir === "left" || dir === "right") return { area: "hand", index: (cur.index + (dir === "right" ? 1 : n - 1)) % n };
    if (dir === "up") return firstRowFrom(field, 0, laneOver(cur.index, n, lanes)) ?? cur;
    return { area: "deck" };
  }
  const ls = occupied(field, cur.row);
  if (dir === "left" || dir === "right") {
    const at = ls.indexOf(cur.lane);
    return { ...cur, lane: ls[(at + (dir === "right" ? 1 : ls.length - 1)) % ls.length]! };
  }
  const at = ROWS_UP.indexOf(cur.row);
  if (dir === "up") return firstRowFrom(field, at + 1, cur.lane) ?? cur;
  for (let i = at - 1; i >= 0; i--) {
    const l = nearestLane(field, ROWS_UP[i]!, cur.lane);
    if (l !== null) return { area: "board", row: ROWS_UP[i]!, lane: l };
  }
  if (field.hand) {
    // Back to the hand card under this lane.
    const index = field.hand <= 1 ? 0 : Math.round((cur.lane / Math.max(1, lanes - 1)) * (field.hand - 1));
    return { area: "hand", index };
  }
  return { area: "deck" };
}

/** The board place (visuals/board.ts key) a board focus rings. */
export function focusKey(f: Focus | null): string | null {
  if (!f || f.area !== "board") return null;
  return f.row === "spell" ? `me:spell:${f.lane}` : `${f.row}:monster:${f.lane}`;
}

/**
 * A number key in your turn: select hand card N, or unselect it if it already is. `open` is the uid whose menu is
 * open (if a hand card's). Returns null when there's no card N.
 */
export function numberPick(n: number, handUids: number[], open: number | null): { uid: number; index: number; select: boolean } | null {
  const uid = handUids[n - 1];
  if (uid === undefined) return null;
  return { uid, index: n - 1, select: uid !== open };
}

// ---- the action menu ----

/** Board dims are picked on the board (the places glow); the rest are buttons. */
export const BOARD_DIMS: Dim[] = ["lane", "target", "to"];

export type MenuItem =
  | { key: string; t: "pick"; dim: Dim; value: string; board: boolean }
  | { key: string; t: "confirm" }
  | { key: string; t: "verb"; verb: Verb }
  | { key: string; t: "read" }
  | { key: string; t: "back" };

export interface MenuState { verb: Verb | null; picks: Partial<Record<Dim, string>> }

/** Everything in a menu the arrows move over, in the order it's drawn (board picks first: they're what's asked). */
export function menuItems(menu: MenuState, all: Plan[]): MenuItem[] {
  const groups = groupByVerb(all);
  const plans = menu.verb ? groups.get(menu.verb) ?? [] : [];
  const dims = openDims(plans);
  const boardDim = dims.find((d) => BOARD_DIMS.includes(d) && menu.picks[d] === undefined);
  const otherDims = boardDim ? [] : dims.filter((d) => !BOARD_DIMS.includes(d));
  const out: MenuItem[] = [];
  if (menu.verb && boardDim) {
    for (const value of optionsFor(plans, boardDim, menu.picks)) out.push({ key: `pick:${boardDim}:${value}`, t: "pick", dim: boardDim, value, board: true });
  }
  for (const dim of menu.verb ? otherDims : []) {
    for (const value of optionsFor(plans, dim, menu.picks)) out.push({ key: `pick:${dim}:${value}`, t: "pick", dim, value, board: false });
  }
  const done = menu.verb ? resolve(plans, menu.picks) : null;
  if (menu.verb && !boardDim && (otherDims.length ? done : plans.length)) out.push({ key: "confirm", t: "confirm" });
  for (const v of groups.keys()) if (v !== menu.verb) out.push({ key: `verb:${v}`, t: "verb", verb: v });
  out.push({ key: "read", t: "read" }, { key: "back", t: "back" });
  return out;
}

/** The menu cursor after an arrow (±1). With no cursor yet, it lands on the first option. */
export function stepMenu(items: MenuItem[], sel: string | undefined, step: 1 | -1): string | undefined {
  if (!items.length) return undefined;
  const at = sel === undefined ? -1 : items.findIndex((i) => i.key === sel);
  if (at < 0) return items[0]!.key;
  return items[(at + step + items.length) % items.length]!.key;
}

/** Board picks move with ←/→ among themselves; ↑/↓ walk the whole list. */
export function menuArrow(items: MenuItem[], sel: string | undefined, dir: Dir): string | undefined {
  const cur = items.find((i) => i.key === sel);
  if (cur?.t === "pick" && cur.board && (dir === "left" || dir === "right")) {
    const picks = items.filter((i) => i.t === "pick" && i.board);
    return stepMenu(picks, sel, dir === "right" ? 1 : -1);
  }
  return stepMenu(items, sel, dir === "right" || dir === "down" ? 1 : -1);
}

/** What ←/→ selects next while a card's menu is open: the neighbouring hand card, or your neighbouring monster. */
export type Selected = { kind: "hand"; uid: number } | { kind: "monster"; lane: number };

/**
 * ←/→ with a card's menu open. While the menu cursor is on a board pick (a lane or target), the arrows keep choosing
 * among those, so this returns "menu". Otherwise they move the selection: to the previous/next hand card, or to your
 * nearest monster that can act in that direction. Stops at the ends (null).
 * `ownLanes[l]`: you have a monster in lane l that has something to do.
 */
export function stepSelection(sel: Selected, dir: "left" | "right", handUids: number[], ownLanes: boolean[], onBoardPick: boolean): Selected | null | "menu" {
  if (onBoardPick) return "menu";
  const step = dir === "right" ? 1 : -1;
  if (sel.kind === "hand") {
    const at = handUids.indexOf(sel.uid);
    const uid = at < 0 ? undefined : handUids[at + step];
    return uid === undefined ? null : { kind: "hand", uid };
  }
  for (let l = sel.lane + step; l >= 0 && l < ownLanes.length; l += step) if (ownLanes[l]) return { kind: "monster", lane: l };
  return null;
}
