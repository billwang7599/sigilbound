/** Every action a player may take right now. The engine validates actions against this list. */
import { card, CREST_COST } from "./cards.js";
import {
  actors, adjacent, ambushKind, atkOf, canAttack, defOf, field, hasLeap, isGuarding, MOVE_COST, other, untapped,
} from "./stats.js";
import type { Action, AttackTarget, GameState, PlayerId, Position } from "./types.js";

const POSITIONS: Position[] = ["atk", "def"];

export function legalActions(s: GameState, p: PlayerId): Action[] {
  if (!actors(s).includes(p)) return [];
  if (s.step === "mulligan") return [{ type: "mulligan", uids: [] }];
  if (s.window) return windowActions(s, p);
  if (s.step === "attack") return [...attackActions(s, p), { type: "endTurn" }];
  return [...mainActions(s, p), ...(s.turn === 1 ? [] : [{ type: "attackStep" } as Action]), { type: "endTurn" }];
}

function windowActions(s: GameState, p: PlayerId): Action[] {
  const w = s.window!;
  const out: Action[] = [{ type: "pass" }];
  const free = untapped(s, p);
  for (const c of s.players[p].hand) {
    const def = card(c.id);
    if (def.kind !== "ambush" || def.cost > free || ambushKind(c.id) !== w.kind) continue;
    if (w.kind === "attack") {
      if (c.id === "brace" && w.target.kind !== "monster") continue;
      if (c.id === "smoke" && w.target.kind !== "direct") continue;
      if (c.id === "snap_trap" && atkOf(s, s.active, w.attacker) > 4) continue;
    }
    out.push({ type: "ambush", uid: c.uid });
  }
  return out;
}

export function attackTargets(s: GameState, p: PlayerId, lane: number): AttackTarget[] {
  const o = other(p);
  const opp = s.players[o].monsters;
  const guards = [0, 1, 2].filter((g) => Math.abs(g - lane) <= 1 && isGuarding(opp[g] ?? null));
  if (guards.length) return guards.map((g) => ({ kind: "monster", lane: g }));
  const m = s.players[p].monsters[lane]!;
  if (!opp[lane]) return [{ kind: "direct" }];
  return [{ kind: "monster", lane }, ...(hasLeap(s, lane, m) ? [{ kind: "direct" } as AttackTarget] : [])];
}

function attackActions(s: GameState, p: PlayerId): Action[] {
  const out: Action[] = [];
  s.players[p].monsters.forEach((m, lane) => {
    if (!canAttack(s, m)) return;
    for (const target of attackTargets(s, p, lane)) out.push({ type: "attack", lane, target });
  });
  return out;
}

export function canMove(s: GameState, p: PlayerId, from: number, to: number, ignoreEntered: boolean): boolean {
  if (!adjacent(from, to) || to < 0 || to > 2) return false;
  if (field(s, from) === "mountain_pass" || field(s, to) === "mountain_pass") return false;
  const ms = s.players[p].monsters;
  const a = ms[from], b = ms[to];
  if (!a) return false;
  if (ignoreEntered) return true;
  return a.entered !== s.turn && (!b || b.entered !== s.turn);
}

function moves(s: GameState, p: PlayerId, ignoreEntered: boolean): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  const ms = s.players[p].monsters;
  for (let from = 0; from < 3; from++) {
    for (const to of [from - 1, from + 1]) {
      // A swap is listed once, from the lower lane.
      if (ms[to] && to < from) continue;
      if (canMove(s, p, from, to, ignoreEntered)) out.push({ from, to });
    }
  }
  return out;
}

function mainActions(s: GameState, p: PlayerId): Action[] {
  const pl = s.players[p];
  const o = other(p);
  const free = untapped(s, p);
  const out: Action[] = [];
  const oppLanes = [0, 1, 2].filter((l) => s.players[o].monsters[l]);

  for (const c of pl.hand) {
    const def = card(c.id);
    if (def.kind === "hidden") continue;
    if (!pl.bound) out.push({ type: "bind", uid: c.uid });
    if (def.cost > free) continue;
    if (def.kind === "monster") {
      const targetSets = c.id === "abyssal_leviathan" ? subsetsUpTo2(oppLanes) : [undefined];
      for (let lane = 0; lane < 3; lane++) {
        for (const position of POSITIONS) {
          for (const targets of targetSets) {
            out.push(targets ? { type: "summon", uid: c.uid, lane, position, targets } :
              { type: "summon", uid: c.uid, lane, position });
          }
        }
      }
    } else if (def.kind === "quick") {
      if (c.id === "spark") {
        for (const side of [o, p]) {
          for (let lane = 0; lane < 3; lane++) {
            if (s.players[side].monsters[lane] && defOf(s, side, lane) <= 2) {
              out.push({ type: "cast", uid: c.uid, target: { side, lane } });
            }
          }
        }
      } else {
        out.push({ type: "cast", uid: c.uid });
      }
    } else if (def.kind === "prepared") {
      for (let lane = 0; lane < 3; lane++) if (!pl.spells[lane]) out.push({ type: "set", uid: c.uid, lane });
    }
  }

  pl.monsters.forEach((m, lane) => {
    if (m && m.entered !== s.turn && !m.posChanged) out.push({ type: "position", lane });
  });

  pl.spells.forEach((sp, lane) => {
    if (!sp || sp.setTurn >= s.turn) return;
    if (sp.id === "second_wind" && !pl.monsters[lane]) {
      const dead = pl.discard.filter((c) => card(c.id).kind === "monster");
      if (dead.length) {
        for (const c of dead) for (const position of POSITIONS) out.push({ type: "flip", lane, uid: c.uid, position });
        return;
      }
    }
    out.push({ type: "flip", lane });
  });

  if (!pl.crestUsed && free >= CREST_COST) {
    if (pl.crest === "tide") out.push({ type: "crest" });
    else if (pl.crest === "gale") {
      for (const mv of moves(s, p, true)) out.push({ type: "crest", lane: mv.from, to: mv.to });
    } else {
      pl.monsters.forEach((m, lane) => m && out.push({ type: "crest", lane }));
    }
  }

  if (!pl.moved && free >= MOVE_COST) for (const mv of moves(s, p, false)) out.push({ type: "move", ...mv });
  return out;
}

function subsetsUpTo2(lanes: number[]): number[][] {
  if (!lanes.length) return [[]];
  const out: number[][] = lanes.map((l) => [l]);
  for (let i = 0; i < lanes.length; i++) for (let j = i + 1; j < lanes.length; j++) out.push([lanes[i]!, lanes[j]!]);
  return out;
}

/** Key-order-independent comparison; `targets` order doesn't matter. */
export function sameAction(a: Action, b: Action): boolean {
  return canonical(a) === canonical(b);
}

function canonical(a: Action): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  const x = { ...a } as Record<string, unknown>;
  if (Array.isArray(x.targets)) x.targets = [...(x.targets as number[])].sort((m, n) => m - n);
  return JSON.stringify(norm(x));
}
