import { card } from "@sigilbound/engine";

/**
 * Every keyword and rules term a card can show, explained in one place. Wording follows RULES.md v0.6 (sections 5,
 * 7, 8, 9 and 10). The card popup underlines these and shows the text on hover.
 */
export interface Keyword {
  /** What the tooltip is titled. */
  name: string;
  text: string;
}

export const KEYWORDS: Record<string, Keyword> = {
  guard: {
    name: "Guard",
    text: "Only works in defense position. Enemy monsters in this lane and the adjacent lanes that attack must attack " +
      "this monster (Leap included). In the center it pulls from all 3 lanes; on an edge, from 2.",
  },
  leap: {
    name: "Leap",
    text: "When it attacks, you may hit the opponent directly even if a monster is across, unless a Guard pulls the attack.",
  },
  rush: {
    name: "Rush",
    text: "+2 ATK while you have 3 or fewer Sigils (tapped or not). Checked all the time, so it turns off the moment " +
      "you bind your 4th.",
  },
  awaken: {
    name: "Awaken N",
    text: "When you play this from your hand with N or more Sigils (tapped or not), it gets the listed bonus for as " +
      "long as it stays on the board. Monsters brought back any other way (e.g. Second Wind) don't Awaken.",
  },
  swift: { name: "Swift", text: "Can attack the turn it enters play. (Later set.)" },
  trample: {
    name: "Trample",
    text: "When it destroys a defense-position monster, the opponent loses LP equal to whatever went past the " +
      "defender's remaining DEF. (Later set.)",
  },
  sturdy: {
    name: "Sturdy",
    text: "The first time each turn this would be destroyed in battle, it isn't. Its damage stays, so the next hit " +
      "that turn destroys it. (Later set.)",
  },
  quick: {
    name: "Quick spell",
    text: "Cast it from your hand in your Main step. Pay its cost, it happens right away, then it goes to your discard pile.",
  },
  prepared: {
    name: "Prepared spell",
    text: "In your Main step, pay and set it face down in an empty spell slot. On a later turn of yours, flip it for " +
      "free during your Main step. It happens, then goes to your discard pile. Its range counts from its lane.",
  },
  ambush: {
    name: "Ambush",
    text: "Play it on your opponent's turn, from your hand, when its condition happens. Pay with untapped Sigils. At " +
      "most 1 Ambush per opponent turn, and nothing can respond to it.",
  },
  monster: {
    name: "Monster",
    text: "Play it into one of your monster slots by paying its cost, in attack position (upright) or defense " +
      "position (sideways). It can't attack or change position the turn it enters play.",
  },
  onPlay: { name: "On play", text: "Happens once, when the card enters play from your hand." },
  whenDestroyed: {
    name: "When destroyed",
    text: "Happens when it goes from the board to the discard pile. Being replaced doesn't count.",
  },
  flip: {
    name: "Flip",
    text: "What a Prepared spell does when you turn it face up on a later turn of yours (free).",
  },
  across: { name: "Across", text: "The enemy slot directly opposite this lane." },
  adjacent: { name: "Adjacent", text: "The lanes next to this one. The center has 2 neighbors; each edge lane has 1." },
  sigil: {
    name: "Sigil",
    text: "A card bound face down from your hand (once per turn). Tap Sigils to pay costs; they straighten at the start " +
      "of your turn. How many you have is public, which cards they are is secret.",
  },
  atk: { name: "ATK", text: "Attack. Against an attack-position monster, the lower ATK is destroyed and its owner loses the difference." },
  def: {
    name: "DEF",
    text: "Defense. A defense-position monster takes damage that adds up for the turn; when it reaches DEF, it's destroyed.",
  },
};

/** Words in card text that get a tooltip, longest first so "Awaken 5" wins over shorter matches. */
const PATTERNS: [RegExp, string][] = [
  [/Awaken \d+/, "awaken"],
  [/When destroyed/, "whenDestroyed"],
  [/On play/, "onPlay"],
  [/\bGuard\b/, "guard"],
  [/\bLeap\b/, "leap"],
  [/\bRush\b/, "rush"],
  [/\bSwift\b/, "swift"],
  [/\bTrample\b/, "trample"],
  [/\bSturdy\b/, "sturdy"],
  [/\bFlip\b/, "flip"],
  [/\bacross\b/, "across"],
  [/\badjacent\b/, "adjacent"],
  [/\bDEF\b/, "def"],
  [/\bATK\b/, "atk"],
];

const ANY = new RegExp(PATTERNS.map(([r]) => r.source).join("|"), "g");

export type TextPart = { text: string; kw?: string };

/** Splits card text into plain runs and keyword runs. */
export function splitKeywords(text: string): TextPart[] {
  const out: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(ANY)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i) });
    const kw = PATTERNS.find(([r]) => new RegExp(`^(?:${r.source})$`).test(m[0]))?.[1];
    out.push({ text: m[0], kw });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Rules words on a card, as KEYWORDS keys: its kind (spells), then keywords in its text, in order, once each. */
export function keywordsOf(id: string): string[] {
  const def = card(id);
  if (def.kind === "hidden") return [];
  const out: string[] = [];
  if (def.kind !== "monster") out.push(def.kind);
  for (const p of splitKeywords(def.text ?? "")) {
    if (p.kw && p.kw !== "atk" && p.kw !== "def" && !out.includes(p.kw)) out.push(p.kw);
  }
  return out;
}
