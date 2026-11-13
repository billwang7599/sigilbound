/** Read-only rules queries: effective stats, keywords, who can act. Shared by the engine, AI and client previews. */
import { card, CARDS, type FieldId } from "./cards.js";
import type { GameState, Monster, PendingWindow, PlayerId } from "./types.js";

export const START_LP = 20;
export const HAND_LIMIT = 7;
export const OPENING_HAND = 5;
export const EMPTY_DECK_LOSS = 2;
export const MOVE_COST = 1;

export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
export const adjacent = (a: number, b: number): boolean => Math.abs(a - b) === 1;
export const field = (s: GameState, lane: number): FieldId => s.fields[lane]!;

export function untapped(s: GameState, p: PlayerId): number {
  return s.players[p].sigils.filter((x) => !x.tapped).length;
}

export function atkOf(s: GameState, p: PlayerId, lane: number): number {
  const m = s.players[p].monsters[lane];
  if (!m) return 0;
  const c = card(m.id);
  let v = c.atk + m.atkPerm + m.atkTurn;
  if (c.rush && s.players[p].sigils.length <= 3) v += 2;
  if (field(s, lane) === "volcano" && c.affinity === "fire") v += 1;
  return Math.max(0, v);
}

export function defOf(s: GameState, p: PlayerId, lane: number): number {
  const m = s.players[p].monsters[lane];
  if (!m) return 0;
  const c = card(m.id);
  let v = c.def + m.defPerm + m.defTurn + m.defStone;
  const f = field(s, lane);
  if (f === "volcano" && c.affinity !== "fire") v -= 1;
  if (f === "deep_lake" || f === "mountain_pass") v += 1;
  if (f === "storm_peak" && c.affinity !== "air") v -= 1;
  return v;
}

export function hasLeap(s: GameState, lane: number, m: Monster): boolean {
  const c = card(m.id);
  const f = field(s, lane);
  if (f === "deep_lake") return false;
  return !!c.leap || (f === "storm_peak" && c.affinity === "air");
}

export function isGuarding(m: Monster | null): boolean {
  return !!m && m.position === "def" && !!card(m.id).guard;
}

/** Can this monster attack right now (ignoring whose step it is)? */
export function canAttack(s: GameState, m: Monster | null): m is Monster {
  return !!m && m.position === "atk" && !m.attacked && m.entered !== s.turn;
}

/** Ambush trigger kinds that some card in the pool answers, and the cheapest such Ambush. */
const WINDOW_COST: Record<PendingWindow["kind"], number> = { attack: 99, destroyed: 99 };
const AMBUSH_KIND: Record<string, PendingWindow["kind"]> = {
  brace: "attack", smoke: "attack", snap_trap: "attack", riposte: "destroyed",
};
for (const [id, kind] of Object.entries(AMBUSH_KIND)) {
  const c = CARDS[id];
  if (c) WINDOW_COST[kind] = Math.min(WINDOW_COST[kind], c.cost);
}

/**
 * Should a window open for `responder`? Only public facts decide it (Sigil count, whether they've used their Ambush
 * this turn), never what's in their hand, so the pause can't leak a card (plan/architecture.md, Ambush windows).
 */
export function windowOpens(s: GameState, responder: PlayerId, kind: PendingWindow["kind"]): boolean {
  const pl = s.players[responder];
  return !pl.ambushUsed && untapped(s, responder) >= WINDOW_COST[kind];
}

export function ambushKind(id: string): PendingWindow["kind"] | null {
  return AMBUSH_KIND[id] ?? null;
}

/** The players who may send an action now (concede aside). */
export function actors(s: GameState): PlayerId[] {
  if (s.step === "over") return [];
  if (s.step === "mulligan") return ([0, 1] as PlayerId[]).filter((p) => !s.players[p].mulliganDone);
  if (s.window) return [s.window.responder];
  return [s.active];
}
