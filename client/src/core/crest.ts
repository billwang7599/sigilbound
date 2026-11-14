/**
 * The Crest button (RULES.md section 6): what it shows, whether it can be used and why not, and picking its target on
 * the board. Pure: no DOM, no Pixi. Everything it can do is filtered from the server's `legal` list.
 */
import { CREST_COST, CRESTS, type Action, type CrestId, type GameState, type PlayerId } from "@sigilbound/engine";
import { LANE_NAMES } from "./intent.js";

export type CrestAction = Extract<Action, { type: "crest" }>;

/** What the Crest does in a couple of words (button captions and the log). */
export const CREST_SHORT: Record<CrestId, string> = {
  ember: "+2 ATK", tide: "+2 LP", stone: "+2 DEF", gale: "free Move",
};

export interface CrestStatus {
  crest: CrestId;
  name: string;
  text: string;
  /** "monster": pick one of your monsters; "move": pick a monster, then where it goes; "none": happens at once. */
  target: "none" | "monster" | "move";
  usable: boolean;
  /** Used this turn already (its owner's turn). */
  used: boolean;
  /** Why it can't be used right now (null when usable). */
  reason: string | null;
}

const crestActions = (legal: Action[]): CrestAction[] => legal.filter((a): a is CrestAction => a.type === "crest");

/**
 * The Crest of player `p` as seen by `me`. For the rival's Crest, `legal` is ignored: it's a read-only badge, so the
 * reason only says whether it's been used this turn.
 */
export function crestStatus(s: GameState, p: PlayerId, me: PlayerId, legal: Action[]): CrestStatus {
  const pl = s.players[p];
  const c = CRESTS[pl.crest];
  const target = pl.crest === "tide" ? "none" : pl.crest === "gale" ? "move" : "monster";
  const used = pl.crestUsed && s.active === p;
  const base = { crest: pl.crest, name: c.name, text: c.text, target, used } as const;
  if (p !== me) return { ...base, usable: false, reason: used ? "Used this turn" : null };
  if (crestActions(legal).length) return { ...base, usable: true, reason: null };
  const ready = pl.sigils.filter((g) => !g.tapped).length;
  const reason = s.step === "mulligan" || s.step === "over" ? "Not now"
    : s.active !== me ? "Not your turn"
    : used ? "Used this turn"
    : s.window ? "Wait for the Ambush window to close"
    : s.step !== "main" ? "Only in your Main step (before attacking)"
    : ready < CREST_COST ? `Needs ${CREST_COST} untapped Sigils (you have ${ready})`
    : target === "move" ? "No monster can move right now"
    : "No monster to use it on";
  return { ...base, usable: false, reason };
}

/** Picking a Crest's target on the board: `from` is the monster already picked for a Gale move. */
export interface CrestPick { from: number | null }

/** Which of your monster slots hold a monster (a Gale swap can be picked from either of its two monsters). */
export type Occupied = readonly boolean[];

/** The pickable steps: a monster (`from`), where it goes (`to`, Gale only), and the action they send. */
interface Edge { from: number; to: number | null; act: CrestAction }

function edges(legal: Action[], occupied: Occupied): Edge[] {
  const out: Edge[] = [];
  for (const a of crestActions(legal)) {
    if (a.lane === undefined) continue;
    if (a.to === undefined) { out.push({ from: a.lane, to: null, act: a }); continue; }
    out.push({ from: a.lane, to: a.to, act: a });
    // The engine lists a swap once (from the lower lane); picking the other monster first does the same swap.
    if (occupied[a.to]) out.push({ from: a.to, to: a.lane, act: a });
  }
  return out;
}

/** The pick to start with when the button is pressed: null if no target is needed (use it right away). */
export function startPick(legal: Action[], occupied: Occupied): CrestPick | null {
  const es = edges(legal, occupied);
  if (!es.length) return null;
  // Gale with a single monster that can move: skip straight to where it goes.
  const froms = [...new Set(es.map((e) => e.from))];
  if (es.some((e) => e.to !== null) && froms.length === 1) return { from: froms[0]! };
  return { from: null };
}

/** The action that needs no target (Tide), if that's the Crest. */
export function instantCrest(legal: Action[]): CrestAction | null {
  return crestActions(legal).find((a) => a.lane === undefined) ?? null;
}

/** The lanes that glow while picking, in lane order (your monster slots: `me:monster:N`). */
export function pickLanes(legal: Action[], pick: CrestPick, occupied: Occupied): number[] {
  const es = edges(legal, occupied);
  const lanes = pick.from === null ? es.map((e) => e.from) : es.filter((e) => e.from === pick.from && e.to !== null).map((e) => e.to!);
  return [...new Set(lanes)].sort((a, b) => a - b);
}

/**
 * A lane picked on the board: the Crest action to send, the next pick (a Gale move's destination), or null if that
 * lane isn't a legal target (the pick is cancelled).
 */
export function pickAt(legal: Action[], pick: CrestPick, lane: number, occupied: Occupied): { act: CrestAction } | { pick: CrestPick } | null {
  const es = edges(legal, occupied);
  if (pick.from === null) {
    const here = es.filter((e) => e.from === lane);
    if (!here.length) return null;
    // Gale with more than one place to go: ask where. Otherwise there's nothing more to ask.
    return here.length > 1 && here.some((e) => e.to !== null) ? { pick: { from: lane } } : { act: here[0]!.act };
  }
  const e = es.find((x) => x.from === pick.from && x.to === lane);
  return e ? { act: e.act } : null;
}

/** What the Crest did, for captions and the log: "Ember crest: Center monster +2 ATK". */
export function crestCaption(crest: CrestId, who: "You" | "Rival", lane?: number, to?: number): string {
  const n = CRESTS[crest].name;
  if (crest === "gale" && lane !== undefined && to !== undefined) return `${who}: ${n} crest · move ${LANE_NAMES[lane]} → ${LANE_NAMES[to]}`;
  if (lane !== undefined) return `${who}: ${n} crest · ${LANE_NAMES[lane]} monster ${CREST_SHORT[crest]}`;
  return `${who}: ${n} crest · ${CREST_SHORT[crest]}`;
}
