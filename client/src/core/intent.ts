/**
 * Turning drags, popup buttons and keys into one of the server's legal actions. The client never invents an action:
 * everything here is filtered from `legal`, which the server computed. The one extra is an attack offered during
 * your Main step: it's sent as the legal "go to attack" action followed by that attack, once the server lists it.
 */
import {
  attackTargets, canAttack, card, CRESTS, type Action, type DuelUpdate, type GameState, type PlayerId, type Position,
} from "@sigilbound/engine";

export const LANE_NAMES = ["Left", "Center", "Right"];

/** An action the player can choose, possibly needing the attack step first. */
export interface Plan {
  action: Action;
  viaAttackStep?: boolean;
}

/** What a popup or drag is about. */
export type Source =
  | { kind: "hand"; uid: number }
  | { kind: "monster"; lane: number }
  | { kind: "spell"; lane: number };

const oppOf = (me: PlayerId): PlayerId => (me === 0 ? 1 : 0);

/** Every plan that starts from `src`. */
export function plansFor(src: Source, u: DuelUpdate): Plan[] {
  const legal = u.legal;
  const s = u.view.state;
  const me = u.view.you;
  switch (src.kind) {
    case "hand":
      return legal.filter((a) => "uid" in a && a.uid === src.uid && ["bind", "summon", "cast", "set"].includes(a.type))
        .map((action) => ({ action }));
    case "spell":
      return legal.filter((a) => a.type === "flip" && a.lane === src.lane).map((action) => ({ action }));
    case "monster": {
      const out: Plan[] = legal.filter((a) =>
        (a.type === "position" && a.lane === src.lane) ||
        (a.type === "attack" && a.lane === src.lane) ||
        (a.type === "crest" && a.lane === src.lane) ||
        (a.type === "move" && a.from === src.lane)).map((action) => ({ action }));
      // Attacks from the Main step: go to the attack step first.
      if (legal.some((a) => a.type === "attackStep") && s.step === "main") {
        const m = s.players[me].monsters[src.lane] ?? null;
        if (canAttack(s, m)) {
          for (const target of attackTargets(s, me, src.lane)) {
            out.push({ action: { type: "attack", lane: src.lane, target }, viaAttackStep: true });
          }
        }
      }
      return out;
    }
  }
}

/** The board places (see visuals/board.ts keys) a plan can be dropped on. */
export function dropKeys(a: Action, me: PlayerId): string[] {
  switch (a.type) {
    case "bind": return ["sigils"];
    case "summon": return [`me:monster:${a.lane}`];
    case "set": return [`me:spell:${a.lane}`];
    case "cast": return a.target ? [`${a.target.side === me ? "me" : "opp"}:monster:${a.target.lane}`] : ["field"];
    case "attack":
      return a.target.kind === "direct" ? ["face", `opp:monster:${a.lane}`] : [`opp:monster:${a.target.lane}`];
    case "move": return [`me:monster:${a.to}`];
    case "crest": return a.to !== undefined ? [`me:monster:${a.to}`] : [];
    case "flip": return [`me:spell:${a.lane}`];
    default: return [];
  }
}

/** How each drop place should glow while dragging. */
export function dropMarks(plans: Plan[], s: GameState, me: PlayerId): Map<string, "drop" | "attack" | "replace"> {
  const out = new Map<string, "drop" | "attack" | "replace">();
  for (const p of plans) {
    const a = p.action;
    for (const key of dropKeys(a, me)) {
      const kind = a.type === "attack" || (a.type === "cast" && a.target && a.target.side !== me) ? "attack"
        : a.type === "summon" && s.players[me].monsters[a.lane] ? "replace" : "drop";
      if (!out.has(key) || kind !== "drop") out.set(key, kind);
    }
  }
  return out;
}

/**
 * Plans for a drop on the first matching place under the pointer. When a monster is over its own Leap target, the
 * attack on the monster wins; a paid Move wins over the Gale Crest doing the same move.
 */
export function plansAtDrop(plans: Plan[], keys: string[], me: PlayerId, s: GameState): { key: string; plans: Plan[] } | null {
  for (const key of keys) {
    let hits = plans.filter((p) => dropKeys(p.action, me).includes(key));
    if (!hits.length) continue;
    if (key.startsWith("opp:monster:")) {
      const lane = Number(key.split(":")[2]);
      const occupied = !!s.players[oppOf(me)].monsters[lane];
      const onMonster = hits.filter((p) => !(p.action.type === "attack" && p.action.target.kind === "direct"));
      if (occupied && onMonster.length) hits = onMonster;
    }
    if (hits.some((p) => p.action.type === "move")) hits = hits.filter((p) => p.action.type !== "crest");
    return { key, plans: hits };
  }
  return null;
}

// ---- popup choices ----

export type Verb = "summon" | "cast" | "set" | "flip" | "attack" | "move" | "crest" | "position" | "bind";

/** A choice inside a verb: which lane, which position, which target… */
export type Dim = "lane" | "position" | "targets" | "target" | "revive" | "to";

export interface DimOption { value: string; label: string }

export function verbOf(a: Action): Verb | null {
  return ["summon", "cast", "set", "flip", "attack", "move", "crest", "position", "bind"].includes(a.type) ? a.type as Verb : null;
}

/** The values an action has for each choice. */
export function dimsOf(a: Action): Partial<Record<Dim, string>> {
  switch (a.type) {
    case "summon": return { lane: String(a.lane), position: a.position, targets: (a.targets ?? []).slice().sort().join(",") };
    case "cast": return { target: a.target ? `${a.target.side}:${a.target.lane}` : "" };
    case "set": return { lane: String(a.lane) };
    case "flip": return a.uid !== undefined ? { revive: String(a.uid), position: a.position ?? "atk" } : {};
    case "attack": return { target: a.target.kind === "direct" ? "direct" : String(a.target.lane) };
    case "move": return { to: String(a.to) };
    case "crest": return a.to !== undefined ? { to: String(a.to) } : {};
    default: return {};
  }
}

export const DIM_ORDER: Dim[] = ["lane", "revive", "target", "to", "position", "targets"];

export function optionLabel(verb: Verb, dim: Dim, value: string, s: GameState, me: PlayerId): string {
  const opp = s.players[oppOf(me)];
  const mine = s.players[me];
  const nameOf = (id: string | undefined) => (id ? card(id).name : "?");
  switch (dim) {
    case "lane": {
      const lane = Number(value);
      const old = verb === "summon" ? mine.monsters[lane] : null;
      return `${LANE_NAMES[lane]}${old ? ` (replaces ${nameOf(old.id)})` : ""}`;
    }
    case "position": return value === "atk" ? "Attack" : "Defense";
    case "targets":
      if (!value) return "Return nothing";
      return "Return " + value.split(",").map((l) => `${nameOf(opp.monsters[Number(l)]?.id)} (${LANE_NAMES[Number(l)]})`).join(" + ");
    case "target": {
      if (verb === "attack") {
        if (value === "direct") return "Rival directly";
        return `${nameOf(opp.monsters[Number(value)]?.id)} (${LANE_NAMES[Number(value)]})`;
      }
      if (!value) return "Cast";
      const [side, lane] = value.split(":").map(Number) as [number, number];
      const m = s.players[side as PlayerId].monsters[lane];
      return `${side === me ? "Your" : "Enemy"} ${nameOf(m?.id)} (${LANE_NAMES[lane]})`;
    }
    case "revive": return nameOf(mine.discard.find((c) => String(c.uid) === value)?.id);
    case "to": {
      const lane = Number(value);
      return `${mine.monsters[lane] ? "Swap with" : "Move to"} ${LANE_NAMES[lane]}`;
    }
  }
}

export function verbLabel(verb: Verb, plans: Plan[], s: GameState, me: PlayerId): string {
  const a = plans[0]?.action;
  switch (verb) {
    case "summon": return "Summon";
    case "cast": return "Cast";
    case "set": return "Set face down";
    case "flip": return "Flip";
    case "attack": return plans.every((p) => p.viaAttackStep) ? "Attack (starts attack step)" : "Attack";
    case "move": return "Move (1 Sigil)";
    case "crest": {
      const c = CRESTS[s.players[me].crest];
      return `${c.name} crest (2 Sigils)`;
    }
    case "position": {
      if (a?.type !== "position") return "Switch position";
      return s.players[me].monsters[a.lane]?.position === "atk" ? "Switch to Defense" : "Switch to Attack";
    }
    case "bind": return "Bind as Sigil";
  }
}

/** Plans grouped by verb, in the order the popup lists them. */
export function groupByVerb(plans: Plan[]): Map<Verb, Plan[]> {
  const order: Verb[] = ["summon", "cast", "set", "flip", "attack", "position", "crest", "move", "bind"];
  const out = new Map<Verb, Plan[]>();
  for (const v of order) {
    const ps = plans.filter((p) => verbOf(p.action) === v);
    if (ps.length) out.set(v, ps);
  }
  return out;
}

/** The choices a verb still needs: dims where its plans differ. */
export function openDims(plans: Plan[]): Dim[] {
  return DIM_ORDER.filter((d) => new Set(plans.map((p) => dimsOf(p.action)[d] ?? "")).size > 1);
}

/** Options for one dim, given the picks on the other dims. */
export function optionsFor(plans: Plan[], dim: Dim, picks: Partial<Record<Dim, string>>): string[] {
  const fit = plans.filter((p) => matches(p, picks, dim));
  return [...new Set(fit.map((p) => dimsOf(p.action)[dim] ?? ""))];
}

export function matches(p: Plan, picks: Partial<Record<Dim, string>>, except?: Dim): boolean {
  const d = dimsOf(p.action);
  return Object.entries(picks).every(([k, v]) => k === except || v === undefined || (d[k as Dim] ?? "") === v);
}

/** The single plan the picks lead to, or null if a choice is still open. */
export function resolve(plans: Plan[], picks: Partial<Record<Dim, string>>): Plan | null {
  const fit = plans.filter((p) => matches(p, picks));
  return fit.length === 1 ? fit[0]! : null;
}

/** The main verb a popup opens on: what clicking a hand card is for. */
export function primaryVerb(groups: Map<Verb, Plan[]>, src: Source): Verb | null {
  if (src.kind === "hand") return (["summon", "cast", "set"] as Verb[]).find((v) => groups.has(v)) ?? null;
  if (src.kind === "spell") return groups.has("flip") ? "flip" : null;
  return null;
}

/** Monster positions as the engine names them. */
export const POSITIONS: Position[] = ["atk", "def"];

/** Meaningful things left to do, for the end-turn confirmation. */
export function remainingMoves(u: DuelUpdate): number {
  const me = u.view.you;
  const s = u.view.state;
  let n = u.legal.filter((a) => ["summon", "cast", "set", "flip"].includes(a.type))
    .reduce((set, a) => set.add("uid" in a ? `u${a.uid}` : `f${(a as { lane: number }).lane}`), new Set<string>()).size;
  const attackers = new Set(u.legal.filter((a) => a.type === "attack").map((a) => (a as { lane: number }).lane));
  if (u.legal.some((a) => a.type === "attackStep")) {
    s.players[me].monsters.forEach((m, lane) => { if (canAttack(s, m)) attackers.add(lane); });
  }
  n += attackers.size;
  return n;
}
