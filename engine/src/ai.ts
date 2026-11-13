/**
 * A greedy AI that plays only from a PlayerView (no hidden information). For each legal action it simulates the
 * result on the view (the unknown cards are "hidden" placeholders that can't do anything) and scores the board.
 * A cheap estimate of each side's attacks stands in for deeper search, so buffs and positions are valued by what
 * they do to the coming battles.
 */
import { card } from "./cards.js";
import { apply } from "./engine.js";
import { legalActions } from "./legal.js";
import { atkOf, defOf, hasLeap, isGuarding, other, untapped } from "./stats.js";
import type { Action, GameState, PlayerId } from "./types.js";
import type { PlayerView } from "./view.js";

const WIN = 1_000_000;

export function chooseAction(view: PlayerView): Action {
  const me = view.you;
  const s = view.state;
  if (s.step === "mulligan") return { type: "mulligan", uids: mulliganPick(s, me) };
  // A 0-ATK attack can't do anything except open an Ambush window for the opponent.
  const legal = dedupe(s, legalActions(s, me)).filter((a) => a.type !== "attack" || atkOf(s, me, a.lane) > 0);
  if (!legal.length) throw new Error("AI asked to move with no legal actions");
  if (legal.length === 1) return legal[0]!;

  const target = sigilTarget(s, me);
  let best: Action = legal[0]!;
  let bestScore = -Infinity;
  for (const a of legal) {
    const sc = scoreAction(s, me, a, target);
    if (sc > bestScore + 1e-9) {
      bestScore = sc;
      best = a;
    }
  }
  return best;
}

export function scoreAction(s: GameState, me: PlayerId, a: Action, target = sigilTarget(s, me)): number {
  const pl = s.players[me];
  const rest = pl.bound ? 0 : handValue(pl.hand.length + 1) - handValue(pl.hand.length);
  switch (a.type) {
    case "endTurn":
      return evaluate(s, me, target, true) + rest;
    case "attackStep":
      return evaluate(s, me, target, false) + rest + 0.1;
    default: {
      const next = simulate(s, me, a);
      if (!next) return -Infinity;
      let sc = evaluate(next, me, target, false) + (s.active === me && !next.players[me].bound ? rest : 0);
      if (a.type === "bind") sc -= 0.05 * keepValue(s, me, a.uid, target);
      // Prefer pushing the game forward over shuffling when scores tie.
      if (a.type === "move" || a.type === "position") sc -= 0.2;
      return sc;
    }
  }
}

/** Apply an action on a copy and let the opponent pass any windows it opens (their hand is unknown). */
function simulate(s: GameState, me: PlayerId, a: Action): GameState | null {
  try {
    let next = apply(s, me, a).state;
    let guard = 0;
    while (next.window && next.window.responder !== me && guard++ < 4) {
      next = apply(next, next.window.responder, { type: "pass" }).state;
    }
    return next;
  } catch {
    return null;
  }
}

/** Same card in two copies is the same choice. */
function dedupe(s: GameState, actions: Action[]): Action[] {
  const pl = s.players[s.window ? s.window.responder : s.active];
  const idOf = (uid: number) => pl.hand.find((c) => c.uid === uid)?.id ?? pl.discard.find((c) => c.uid === uid)?.id;
  const seen = new Set<string>();
  return actions.filter((a) => {
    const key = JSON.stringify("uid" in a && a.uid !== undefined ? { ...a, uid: idOf(a.uid) } : a);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mulliganPick(s: GameState, me: PlayerId): number[] {
  const hand = s.players[me].hand;
  const cheap = hand.filter((c) => card(c.id).kind === "monster" && card(c.id).cost <= 2).length;
  const cutoff = cheap === 0 ? 4 : 5;
  return hand.filter((c) => card(c.id).cost >= cutoff).map((c) => c.uid);
}

// ---- scoring ----

/** Cards in hand: worth less past 5, nothing past the limit of 7. */
function handValue(n: number): number {
  return Math.min(n, 5) * 2.5 + Math.max(0, Math.min(n, 7) - 5) * 1;
}
const SET_SPELL = 3;

/** How many Sigils this deck wants: the highest cost it has seen in its own cards, 3 to 6. */
export function sigilTarget(s: GameState, me: PlayerId): number {
  const pl = s.players[me];
  const seen = [...pl.hand, ...pl.discard, ...pl.sigils, ...pl.monsters.filter((m) => m !== null)];
  const costs = seen.map((c) => card(c!.id)).filter((c) => c.kind !== "hidden").map((c) => c.cost);
  return Math.max(3, Math.min(6, Math.max(0, ...costs)));
}

function keepValue(s: GameState, me: PlayerId, uid: number, target: number): number {
  const c = s.players[me].hand.find((x) => x.uid === uid);
  if (!c) return 0;
  const def = card(c.id);
  if (def.cost > target) return 0;
  const sig = s.players[me].sigils.length;
  if (def.cost <= sig + 1) return 5;
  return 3 - (def.cost - sig) * 0.5;
}

function lpValue(lp: number): number {
  if (lp <= 0) return -150;
  return 3 * Math.min(lp, 30) - (lp < 10 ? (10 - lp) * 1.5 : 0);
}

function monsterValue(s: GameState, p: PlayerId, lane: number): number {
  const m = s.players[p].monsters[lane];
  if (!m) return 0;
  const c = card(m.id);
  const atk = Math.max(0, atkOf(s, p, lane) - m.atkTurn);
  const def = Math.max(0, defOf(s, p, lane) - m.defTurn);
  return 2 + atk + def * 0.6 + (c.guard ? 2 : 0) + (hasLeap(s, lane, m) ? 1.5 : 0) + c.cost * 0.3;
}

function sigilValue(n: number, target: number): number {
  let v = 0;
  for (let i = 0; i < n; i++) v += i < 3 ? 8 : i < target ? 6 : 0.5;
  return v;
}

export function evaluate(s: GameState, me: PlayerId, target: number, ending: boolean): number {
  if (s.step === "over") return s.winner === me ? WIN - s.turn : -WIN + s.turn;
  const o = other(me);
  const mine = s.players[me], theirs = s.players[o];
  let v = lpValue(mine.lp) - lpValue(theirs.lp);
  for (let l = 0; l < 3; l++) v += monsterValue(s, me, l) - monsterValue(s, o, l);
  v += sigilValue(mine.sigils.length, target) - sigilValue(theirs.sigils.length, 5);
  v += handValue(mine.hand.length) - handValue(theirs.hand.length);
  v += (mine.spells.filter(Boolean).length - theirs.spells.filter(Boolean).length) * SET_SPELL;

  const myTurn = s.active === me && !ending;
  if (s.active === me) {
    // Holding up an Ambush through the opponent's turn.
    const free = untapped(s, me);
    if (mine.hand.some((c) => card(c.id).kind === "ambush" && card(c.id).cost <= free)) v += 3;
    v += myTurn ? 0.9 * pressure(s, me, true) : 0.3 * pressure(s, me, false);
    v -= 0.8 * pressure(s, o, false);
  } else {
    v -= 0.9 * pressure(s, o, true);
    v += 0.3 * pressure(s, me, false);
  }
  return v;
}

interface Defender { atk: number; def: number; damage: number; pos: "atk" | "def"; guard: boolean; value: number }

/**
 * Roughly what `p`'s attacks are worth: this turn's attacks (`now`), or next turn's from everything in attack
 * position (turn buffs gone). Attacks that would lose are skipped, as a player would.
 */
export function pressure(s: GameState, p: PlayerId, now: boolean): number {
  if (s.step === "over") return 0;
  if (now && (s.turn === 1 && s.active === s.first)) return 0;
  const o = other(p);
  const att = s.players[p].monsters, opp = s.players[o].monsters;
  const defenders: (Defender | null)[] = opp.map((m, l) => m && {
    atk: Math.max(0, atkOf(s, o, l) - (now ? 0 : m.atkTurn)),
    def: defOf(s, o, l) - (now ? 0 : m.defTurn + (p === s.active ? 0 : m.defStone)),
    damage: now ? m.damage : 0, pos: m.position, guard: isGuarding(m), value: monsterValue(s, o, l),
  });
  const lanes = [0, 1, 2].filter((l) => {
    const m = att[l];
    if (!m || m.position !== "atk") return false;
    return now ? !m.attacked && m.entered !== s.turn : true;
  }).sort((a, b) => atkOf(s, p, b) - atkOf(s, p, a));

  let lp = 0, kills = 0, lost = 0;
  for (const l of lanes) {
    const m = att[l]!;
    const atk = Math.max(0, atkOf(s, p, l) - (now ? 0 : m.atkTurn));
    const guards = [0, 1, 2].filter((g) => Math.abs(g - l) <= 1 && defenders[g]?.guard);
    let tl: number | null;
    if (guards.length) tl = guards.sort((a, b) => remaining(defenders[a]!) - remaining(defenders[b]!))[0]!;
    else if (!defenders[l] || hasLeap(s, l, m)) tl = null;
    else tl = l;
    if (tl === null) { lp += atk; continue; }
    const d = defenders[tl]!;
    if (d.pos === "atk") {
      if (atk > d.atk) { lp += atk - d.atk; kills += d.value; defenders[tl] = null; }
      else if (atk === d.atk && d.value > monsterValue(s, p, l)) { kills += d.value; lost += monsterValue(s, p, l); defenders[tl] = null; }
    } else {
      d.damage += atk;
      if (d.damage >= d.def) { kills += d.value; defenders[tl] = null; }
    }
  }
  const theirLp = s.players[o].lp;
  let v = lpValue(theirLp) - lpValue(theirLp - lp) + kills - lost;
  if (lp >= theirLp) v += 60;
  return v;
}

const remaining = (d: Defender) => (d.pos === "def" ? d.def - d.damage : 99);
