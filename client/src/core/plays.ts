/**
 * Plays and what they did, read from a batch of server events. The duel screen uses this to reveal the rival's plays
 * (the card big over the board, an arrow to its targets, a caption) and to label the play log. Pure: no DOM, no Pixi.
 */
import { card, type GameEvent, type GameState, type PlayerId } from "@sigilbound/engine";

/** Events that start a new play; anything else that follows is that play's effect. */
const PLAY_TYPES = new Set<GameEvent["t"]>([
  "summon", "cast", "flip", "ambush", "set", "bind", "crest", "move", "position", "attack",
]);
/** Events that end a play's effects without starting a play of their own. */
const BREAKS = new Set<GameEvent["t"]>(["turn", "attackStep", "endTurn", "window", "pass", "gameOver", "draw", "restDraw", "mulligan", "start"]);

/** Plays worth revealing when the rival makes them. */
export const REVEALED = new Set<GameEvent["t"]>(["summon", "cast", "flip", "ambush", "set", "bind"]);

export type PlayEvent = Extract<GameEvent, { t: "summon" | "cast" | "flip" | "ambush" | "set" | "bind" }>;

export interface Play {
  /** Index of the play's event in the batch. */
  at: number;
  event: PlayEvent;
  /** The events it caused (damage, destroys, buffs, LP...). */
  effects: GameEvent[];
}

const side = (p: PlayerId, me: PlayerId) => (p === me ? "me" : "opp");
const name = (id: string | undefined) => (id && id !== "hidden" ? card(id).name : "a monster");

/** The revealable plays in a batch, each with the effects that follow it. */
export function playsIn(events: GameEvent[]): Play[] {
  const out: Play[] = [];
  let cur: Play | null = null;
  events.forEach((e, at) => {
    if (PLAY_TYPES.has(e.t) || BREAKS.has(e.t)) {
      cur = REVEALED.has(e.t) ? { at, event: e as PlayEvent, effects: [] } : null;
      if (cur) out.push(cur);
      return;
    }
    cur?.effects.push(e);
  });
  return out;
}

/** The card a play shows: its id, or "hidden" for a face-down set or a bind. */
export function playCard(e: PlayEvent): string {
  return e.t === "set" || e.t === "bind" ? e.card ?? "hidden" : e.card;
}

/** Board places (visuals/board.ts keys) a play aims at: its target and everything its effects touched. */
export function playTargets(play: Play, me: PlayerId): string[] {
  const keys: string[] = [];
  const add = (k: string) => { if (!keys.includes(k)) keys.push(k); };
  const e = play.event;
  if (e.t === "cast" && e.target) add(`${side(e.target.side, me)}:monster:${e.target.lane}`);
  for (const x of play.effects) {
    switch (x.t) {
      case "damage": case "destroyed": case "bounce": case "buff": case "revive": case "cancelled":
        add(`${side(x.p, me)}:monster:${x.lane}`);
        break;
      case "position":
        if (x.p !== e.p) add(`${side(x.p, me)}:monster:${x.lane}`);
        break;
      case "lp":
        add(`lp:${side(x.p, me)}`);
        break;
    }
  }
  // A summon's own slot is where it lands, not a target.
  if (e.t === "summon") return keys.filter((k) => k !== `${side(e.p, me)}:monster:${e.lane}`);
  return keys;
}

/** Where the revealed card goes once it's been shown. */
export function playDestination(e: PlayEvent, me: PlayerId): string {
  const s = side(e.p, me);
  switch (e.t) {
    case "summon": return `${s}:monster:${e.lane}`;
    case "set": return `${s}:spell:${e.lane}`;
    case "bind": return `sigils:${s}`;
    default: return `discard:${s}`;
  }
}

const LANES = ["Left", "Center", "Right"];

/** What one effect did, in a few words ("Cinderpup destroyed", "you lose 3 LP"). */
export function effectText(x: GameEvent, after: GameState, me: PlayerId): string | null {
  const monsterAt = (p: PlayerId, lane: number) => name(after.players[p].monsters[lane]?.id);
  switch (x.t) {
    case "destroyed": return `${name(x.card)} destroyed`;
    case "bounce": return `${name(x.card)} back to hand`;
    case "revive": return `${name(x.card)} returns`;
    case "damage": return `${monsterAt(x.p, x.lane)} takes ${x.amount}`;
    case "cancelled": return "attack cancelled";
    case "position": return `${monsterAt(x.p, x.lane)} to ${x.position === "atk" ? "attack" : "defense"}`;
    case "lp": return `${x.p === me ? "you" : "rival"} ${x.delta < 0 ? "lose" : "gain"}${x.p === me ? "" : "s"} ${Math.abs(x.delta)} LP`;
    case "buff": {
      const parts = [x.atk ? `${x.atk > 0 ? "+" : ""}${x.atk} ATK` : "", x.def ? `${x.def > 0 ? "+" : ""}${x.def} DEF` : ""].filter(Boolean);
      return parts.length ? `${monsterAt(x.p, x.lane)} ${parts.join(" ")}` : null;
    }
    default: return null;
  }
}

/** A one-line caption: "Rival casts Spark → Flarekit destroyed". */
export function playCaption(play: Play, after: GameState, me: PlayerId): string {
  const e = play.event;
  const who = e.p === me ? "You" : "Rival";
  const s = e.p === me ? "" : "s";
  let head: string;
  switch (e.t) {
    case "summon": head = `${who} summon${s} ${name(e.card)} (${LANES[e.lane]}, ${e.position === "atk" ? "attack" : "defense"})${e.awakened ? ", Awakened!" : ""}`; break;
    case "cast": head = `${who} cast${s} ${name(e.card)}`; break;
    case "flip": head = `${who} flip${s} ${name(e.card)}`; break;
    case "ambush": head = `Ambush! ${who} play${s} ${name(e.card)}`; break;
    case "set": head = e.card ? `${who} set ${name(e.card)} face down (${LANES[e.lane]})` : `${who} set${s} a spell face down (${LANES[e.lane]})`; break;
    case "bind": head = e.card ? `${who} bind ${name(e.card)} as a Sigil` : `${who} bind${s} a Sigil`; break;
  }
  const effects = play.effects.map((x) => effectText(x, after, me)).filter((t): t is string => !!t);
  const uniq = [...new Set(effects)];
  if (!uniq.length) {
    if (e.t === "cast" && e.target) return `${head} on ${name(after.players[e.target.side].monsters[e.target.lane]?.id)}`;
    return head;
  }
  const shown = uniq.slice(0, 3).join(", ") + (uniq.length > 3 ? "…" : "");
  return `${head} → ${shown}`;
}
