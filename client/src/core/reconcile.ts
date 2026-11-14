/**
 * What the board should show for a state, and the steps from what it shows now to that. Pure, so it's tested
 * (client/test/reconcile.test.ts); the Pixi board runs these steps after every update, so whatever an animation did
 * or skipped, the board always ends up matching the server's latest state.
 */
import type { GameState, PlayerId, Position } from "@sigilbound/engine";

export type Side = "me" | "opp";

export interface ShownMonster { uid: number; id: string; position: Position }

export interface Shown {
  /** By `${side}:${lane}`. */
  monsters: Record<string, ShownMonster>;
  /** By `${side}:${lane}`: a signature of the set spell (hidden ones by the turn they were set). */
  spells: Record<string, { sig: string; id: string }>;
  /** Tapped flags, in row order. */
  sigils: Record<Side, boolean[]>;
}

export type Op =
  | { op: "removeMonster"; key: string }
  | { op: "addMonster"; key: string; side: Side; lane: number; m: ShownMonster }
  | { op: "turn"; key: string; position: Position }
  | { op: "removeSpell"; key: string }
  | { op: "addSpell"; key: string; side: Side; lane: number; sig: string; id: string }
  | { op: "sigils"; side: Side; tapped: boolean[] };

export const emptyShown = (): Shown => ({ monsters: {}, spells: {}, sigils: { me: [], opp: [] } });

export function wanted(s: GameState, me: PlayerId): Shown {
  const out = emptyShown();
  for (const side of ["me", "opp"] as const) {
    const pl = s.players[side === "me" ? me : me === 0 ? 1 : 0];
    for (let lane = 0; lane < 3; lane++) {
      const m = pl.monsters[lane];
      if (m) out.monsters[`${side}:${lane}`] = { uid: m.uid, id: m.id, position: m.position };
      const sp = pl.spells[lane];
      if (sp) out.spells[`${side}:${lane}`] = { sig: sp.id === "hidden" ? `h${sp.setTurn}` : `u${sp.uid}`, id: sp.id };
    }
    out.sigils[side] = pl.sigils.map((x) => x.tapped);
  }
  return out;
}

export function diff(shown: Shown, want: Shown): Op[] {
  const ops: Op[] = [];
  for (const side of ["me", "opp"] as const) {
    for (let lane = 0; lane < 3; lane++) {
      const key = `${side}:${lane}`;
      const a = shown.monsters[key], b = want.monsters[key];
      if (a && (!b || a.uid !== b.uid || a.id !== b.id)) ops.push({ op: "removeMonster", key });
      if (b && (!a || a.uid !== b.uid || a.id !== b.id)) ops.push({ op: "addMonster", key, side, lane, m: b });
      else if (a && b && a.position !== b.position) ops.push({ op: "turn", key, position: b.position });
      const x = shown.spells[key], y = want.spells[key];
      if (x && (!y || x.sig !== y.sig)) ops.push({ op: "removeSpell", key });
      if (y && (!x || x.sig !== y.sig)) ops.push({ op: "addSpell", key, side, lane, sig: y.sig, id: y.id });
    }
    const t0 = shown.sigils[side], t1 = want.sigils[side];
    if (t0.length !== t1.length || t0.some((t, i) => t !== t1[i])) ops.push({ op: "sigils", side, tapped: [...t1] });
  }
  return ops;
}

/** What `ops` do to a Shown (the board does the same to its sprites). */
export function applyOps(shown: Shown, ops: Op[]): Shown {
  const out: Shown = {
    monsters: { ...shown.monsters }, spells: { ...shown.spells },
    sigils: { me: [...shown.sigils.me], opp: [...shown.sigils.opp] },
  };
  for (const o of ops) {
    if (o.op === "removeMonster") delete out.monsters[o.key];
    else if (o.op === "addMonster") out.monsters[o.key] = { ...o.m };
    else if (o.op === "turn") out.monsters[o.key] = { ...out.monsters[o.key]!, position: o.position };
    else if (o.op === "removeSpell") delete out.spells[o.key];
    else if (o.op === "addSpell") out.spells[o.key] = { sig: o.sig, id: o.id };
    else out.sigils[o.side] = [...o.tapped];
  }
  return out;
}
