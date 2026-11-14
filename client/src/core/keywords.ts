import { card } from "@sigilbound/engine";

/**
 * Every keyword and rules term a card can show, explained in one place. Meaning follows RULES.md; wording is kept
 * short on purpose. The card popup underlines these and shows the text on hover.
 */
export interface Keyword {
  /** What the tooltip is titled. */
  name: string;
  text: string;
}

export const KEYWORDS: Record<string, Keyword> = {
  // Short and plain. A keyword only names another when reading both wouldn't already tell you how they interact.
  guard: { name: "Guard", text: "Only works in defense position. Enemy attacks from this lane and adjacent lanes must target this monster." },
  leap: { name: "Leap", text: "Can attack the opponent directly, even if a monster is across." },
  rush: { name: "Rush", text: "+2 ATK while you have 3 or fewer Sigils." },
  awaken: { name: "Awaken N", text: "If you play this from your hand with N or more Sigils, it gets the bonus while it stays on the board." },
  swift: { name: "Swift", text: "Can attack the turn it enters play." },
  trample: { name: "Trample", text: "When it destroys a defense-position monster, extra damage hits the opponent's LP." },
  sturdy: { name: "Sturdy", text: "Survives the first time each turn it would be destroyed in battle." },
  quick: { name: "Quick spell", text: "Cast it from your hand on your turn. It happens right away." },
  prepared: { name: "Prepared spell", text: "Pay and set it face down in a spell slot. Flip it for free on a later turn of yours." },
  ambush: { name: "Ambush", text: "Play it from your hand on your opponent's turn, when its condition happens. One per turn." },
  monster: { name: "Monster", text: "Play it into a monster slot in attack (upright) or defense (sideways) position. It can't attack the turn it enters." },
  onPlay: { name: "On play", text: "Happens once, when the card enters play from your hand." },
  whenDestroyed: { name: "When destroyed", text: "Happens when it goes from the board to the discard pile." },
  flip: { name: "Flip", text: "What a Prepared spell does when you turn it face up." },
  across: { name: "Across", text: "The enemy slot directly opposite this lane." },
  adjacent: { name: "Adjacent", text: "The lanes right next to this one." },
  sigil: { name: "Sigil", text: "A card bound face down from your hand, once per turn. Tap Sigils to pay costs; they untap each turn." },
  atk: { name: "ATK", text: "Attack. When two attack-position monsters fight, the lower ATK is destroyed and its owner loses the difference." },
  def: { name: "DEF", text: "Defense. A defense-position monster is destroyed when damage this turn reaches its DEF." },
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
