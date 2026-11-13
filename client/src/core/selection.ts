/**
 * Turning clicks into one of the server's legal actions. The client never invents an action: everything offered
 * here is filtered from `legal`, which the server computed.
 */
import type { Action, PlayerId } from "@sigilbound/engine";

export type Selection =
  | { kind: "hand"; uid: number }
  | { kind: "monster"; lane: number }
  | { kind: "spell"; lane: number };

/** A place on the board. "face" is the opponent themself (for direct attacks). */
export type Slot =
  | { side: "me" | "opp"; row: "monster" | "spell"; lane: number }
  | { side: "opp"; row: "face"; lane: -1 };

export const slotKey = (s: Slot) => `${s.side}:${s.row}:${s.lane}`;

/** The actions a selection can lead to. */
export function optionsFor(sel: Selection, legal: Action[]): Action[] {
  return legal.filter((a) => {
    switch (sel.kind) {
      case "hand":
        return "uid" in a && a.uid === sel.uid && ["bind", "summon", "cast", "set", "ambush"].includes(a.type);
      case "monster":
        return (a.type === "position" && a.lane === sel.lane) ||
          (a.type === "attack" && a.lane === sel.lane) ||
          (a.type === "crest" && a.lane === sel.lane) ||
          (a.type === "move" && a.from === sel.lane);
      case "spell":
        return a.type === "flip" && a.lane === sel.lane;
    }
  });
}

/** The board slots a click could mean for this action. */
export function slotsOf(a: Action, me: PlayerId): Slot[] {
  switch (a.type) {
    case "summon": return [{ side: "me", row: "monster", lane: a.lane }];
    case "set": return [{ side: "me", row: "spell", lane: a.lane }];
    case "cast":
      return a.target ? [{ side: a.target.side === me ? "me" : "opp", row: "monster", lane: a.target.lane }] : [];
    case "attack":
      return a.target.kind === "direct"
        ? [{ side: "opp", row: "face", lane: -1 }, { side: "opp", row: "monster", lane: a.lane }]
        : [{ side: "opp", row: "monster", lane: a.target.lane }];
    case "move": return [{ side: "me", row: "monster", lane: a.to }];
    case "crest": return a.to !== undefined ? [{ side: "me", row: "monster", lane: a.to }] : [];
    default: return [];
  }
}

export interface Pick {
  /** Send this action now. */
  send?: Action;
  /** Or narrow the menu to these. */
  narrow?: Action[];
  /** Or select something else. */
  select?: Selection | null;
}

/** What a click on `slot` means, given the current selection and options. */
export function clickSlot(slot: Slot, sel: Selection | null, options: Action[], legal: Action[], me: PlayerId): Pick {
  if (sel) {
    const key = slotKey(slot);
    const hits = options.filter((a) => slotsOf(a, me).some((s) => slotKey(s) === key));
    if (hits.length === 1) {
      // A direct attack across an empty slot and a click on that slot mean the same thing.
      return { send: hits[0]! };
    }
    if (hits.length > 1) {
      // Prefer the attack on a monster over a Leap past it when clicking the monster itself.
      const exact = hits.filter((a) => !(a.type === "attack" && a.target.kind === "direct" && slot.row === "monster"));
      if (exact.length === 1) return { send: exact[0]! };
      return { narrow: hits };
    }
  }
  if (slot.side === "me" && slot.row === "monster") {
    const s: Selection = { kind: "monster", lane: slot.lane };
    return { select: optionsFor(s, legal).length ? s : null };
  }
  if (slot.side === "me" && slot.row === "spell") {
    const s: Selection = { kind: "spell", lane: slot.lane };
    return { select: optionsFor(s, legal).length ? s : null };
  }
  return { select: null };
}
