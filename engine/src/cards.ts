/**
 * All card data in one place (RULES.md v0.6, section 14). Swap decks or stats here; what each effect *does* lives in
 * effects.ts, keyed by card id.
 */

export type Affinity = "fire" | "water" | "earth" | "air" | "neutral";
export type CardKind = "monster" | "quick" | "prepared" | "ambush" | "hidden";

export interface Awaken {
  n: number;
  atk: number;
  def: number;
}

export interface CardDef {
  id: string;
  name: string;
  kind: CardKind;
  cost: number;
  affinity: Affinity;
  atk: number;
  def: number;
  leap?: boolean;
  guard?: boolean;
  rush?: boolean;
  awaken?: Awaken;
  text: string;
}

function monster(
  id: string, name: string, affinity: Affinity, cost: number, atk: number, def: number, text = "",
  extra: Partial<CardDef> = {},
): CardDef {
  return { id, name, kind: "monster", cost, affinity, atk, def, text, ...extra };
}

function spell(id: string, name: string, kind: "quick" | "prepared" | "ambush", cost: number, text: string): CardDef {
  return { id, name, kind, cost, affinity: "neutral", atk: 0, def: 0, text };
}

const LIST: CardDef[] = [
  monster("cinderpup", "Cinderpup", "fire", 1, 3, 2),
  monster("flarekit", "Flarekit", "fire", 1, 1, 2, "Rush", { rush: true }),
  monster("gustling", "Gustling", "air", 1, 2, 1, "Leap", { leap: true }),
  monster("pebblekin", "Pebblekin", "earth", 1, 0, 3, "Guard", { guard: true }),
  monster("ripplefin", "Ripplefin", "water", 1, 1, 4),
  monster("emberhorn", "Emberhorn", "fire", 2, 4, 3),
  monster("ash_hound", "Ash Hound", "fire", 2, 3, 2, "On play: the monster across gets -2 DEF this turn."),
  monster("blazerunner", "Blazerunner", "fire", 2, 3, 2, "Rush", { rush: true }),
  monster("skitterwing", "Skitterwing", "air", 2, 2, 3, "Leap", { leap: true }),
  monster("mudling", "Mudling", "earth", 2, 1, 4, "Awaken 5: +2/+2", { awaken: { n: 5, atk: 2, def: 2 } }),
  monster("kindlewing", "Kindlewing", "air", 3, 3, 4, "Awaken 4: +2/+2", { awaken: { n: 4, atk: 2, def: 2 } }),
  monster("shellback", "Shellback", "water", 3, 2, 7),
  monster("stormhawk", "Stormhawk", "air", 4, 5, 4, "Leap", { leap: true }),
  monster("kiln_golem", "Kiln Golem", "fire", 4, 5, 5, "When destroyed: your opponent loses 2 LP."),
  monster("boulderhorn", "Boulderhorn", "earth", 4, 1, 8, "Guard", { guard: true }),
  monster("undertow_serpent", "Undertow Serpent", "water", 5, 5, 6,
    "On play: return the monster across to its owner's hand."),
  monster("deepwater_colossus", "Deepwater Colossus", "water", 5, 4, 7, "Awaken 7: +3/+3",
    { awaken: { n: 7, atk: 3, def: 3 } }),
  monster("elder_treant", "Elder Treant", "earth", 6, 7, 5,
    "On play: destroy every enemy monster with DEF 2 or less."),
  monster("abyssal_leviathan", "Abyssal Leviathan", "water", 6, 7, 5,
    "On play: return up to 2 enemy monsters (any lanes) to their owners' hands."),

  spell("spark", "Spark", "quick", 1, "Destroy a monster with DEF 2 or less in any lane."),
  spell("firebolt", "Firebolt", "quick", 2, "Your opponent loses 3 LP."),
  spell("rally", "Rally", "quick", 2, "Your monsters in all lanes get +1 ATK this turn."),
  spell("insight", "Insight", "quick", 2, "Draw 2 cards."),

  spell("undermine", "Undermine", "prepared", 1,
    "Flip: the monster across loses 3 DEF this turn and switches to defense position."),
  spell("warcry", "Warcry", "prepared", 2, "Flip: your monsters in this lane and adjacent lanes get +2 ATK this turn."),
  spell("second_wind", "Second Wind", "prepared", 2,
    "Flip: put a monster from your discard pile into your empty monster slot in this lane."),
  spell("rockslide", "Rockslide", "prepared", 3, "Flip: destroy the monster across, whatever its position."),

  spell("brace", "Brace", "ambush", 1, "When one of your monsters is attacked: it gets +3 DEF this turn."),
  spell("smoke", "Smoke", "ambush", 1, "When an enemy monster would hit you directly: cancel that attack."),
  spell("snap_trap", "Snap Trap", "ambush", 2, "When an enemy monster attacks: destroy it if its ATK is 4 or less."),
  spell("riposte", "Riposte", "ambush", 2, "When one of your monsters is destroyed in battle: destroy the attacker."),

  // Stands in for a card the viewer can't see. Never playable.
  { id: "hidden", name: "?", kind: "hidden", cost: 99, affinity: "neutral", atk: 0, def: 0, text: "" },
];

export const CARDS: Record<string, CardDef> = Object.fromEntries(LIST.map((c) => [c.id, c]));

export function card(id: string): CardDef {
  const def = CARDS[id];
  if (!def) throw new Error(`unknown card ${id}`);
  return def;
}

export type FieldId = "crossroads" | "volcano" | "deep_lake" | "old_forest" | "mountain_pass" | "storm_peak";

export const FIELDS: Record<FieldId, { name: string; text: string }> = {
  crossroads: { name: "Crossroads", text: "No effect." },
  volcano: { name: "Volcano", text: "Fire monsters here get +1 ATK. Non-Fire monsters here get -1 DEF." },
  deep_lake: { name: "Deep Lake", text: "Monsters here get +1 DEF. Leap doesn't work here." },
  old_forest: { name: "Old Forest", text: "At the start of each player's turn, if they have a monster here, they gain 1 LP." },
  mountain_pass: { name: "Mountain Pass", text: "Monsters here get +1 DEF and can't be moved into or out of this lane." },
  storm_peak: { name: "Storm Peak", text: "Air monsters here have Leap. Non-Air monsters here get -1 DEF." },
};

/** Places a duel can happen at; the center lane's field. */
export const CENTER_POOL: FieldId[] = ["crossroads", "old_forest", "mountain_pass", "storm_peak"];

export type CrestId = "ember" | "tide" | "stone" | "gale";

export const CRESTS: Record<CrestId, { name: string; text: string }> = {
  ember: { name: "Ember", text: "One of your monsters gets +2 ATK this turn." },
  tide: { name: "Tide", text: "Gain 2 LP." },
  stone: { name: "Stone", text: "One of your monsters gets +2 DEF until the start of your next turn." },
  gale: { name: "Gale", text: "Do a Move for free, ignoring the 'entered this turn' limit." },
};
export const CREST_COST = 2;

export interface DeckDef {
  id: string;
  name: string;
  home: FieldId;
  crest: CrestId;
  cards: Record<string, number>;
}

export const DECKS: Record<string, DeckDef> = {
  ember_rush: {
    id: "ember_rush",
    name: "Ember Rush (Aggro)",
    home: "volcano",
    crest: "ember",
    cards: {
      cinderpup: 2, flarekit: 2, gustling: 2, emberhorn: 2, ash_hound: 2, blazerunner: 2, skitterwing: 2,
      kindlewing: 2, stormhawk: 2, kiln_golem: 2, spark: 2, firebolt: 2, rally: 2, undermine: 2, warcry: 2,
    },
  },
  deepwall: {
    id: "deepwall",
    name: "Deepwall (Control)",
    home: "deep_lake",
    crest: "stone",
    cards: {
      pebblekin: 2, ripplefin: 2, mudling: 2, shellback: 2, boulderhorn: 2, undertow_serpent: 2,
      deepwater_colossus: 1, elder_treant: 1, abyssal_leviathan: 2, spark: 2, insight: 2, rockslide: 2,
      second_wind: 2, brace: 2, snap_trap: 2, riposte: 1, smoke: 1,
    },
  },
};

export function deckList(deck: DeckDef): string[] {
  return Object.entries(deck.cards).flatMap(([id, n]) => Array.from({ length: n }, () => id));
}
