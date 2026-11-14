/**
 * The people in the hub. Each one plays a deck; you play the other one (the server gives the AI whichever deck
 * you didn't pick, so challenging an Ember Rush player means you bring Deepwall, and the other way round).
 */
import type { DeckChoice } from "@sigilbound/engine";
import type { Appearance } from "../gfx/chibi.js";
import type { Dir, Vec } from "../core/world.js";

export interface Npc {
  id: string;
  name: string;
  appearance: Appearance;
  /** The tile they stand on. */
  tile: Vec;
  facing: Dir;
  /** The deck they duel with. */
  deckId: DeckChoice;
  /** What they say when you talk to them; the last line leads into the duel offer. */
  lines: string[];
  /** After a duel: you won / you lost. */
  win: string;
  lose: string;
}

export const NPCS: Npc[] = [
  {
    id: "hina",
    name: "Hina",
    appearance: { body: "slim", face: "round", eyes: "happy", hair: "twintails", mouth: "grin", skin: "peach", hairColor: "ember", outfit: "crimson" },
    tile: { x: 19, y: 8 },
    facing: "down",
    deckId: "ember_rush",
    lines: [
      "Hiya! I sell spicy buns, but my real passion is setting lanes on fire~",
      "My Cinderpups get SO excited. They just can't wait their turn!",
      "Wanna see how fast they run? I'll go easy on you. Probably!",
    ],
    win: "Eeh?! You stopped my pups... You're really good! Come back for a rematch, okay?",
    lose: "Hehe, too fast for you? Don't worry, the buns are still warm~",
  },
  {
    id: "bram",
    name: "Old Bram",
    appearance: { body: "round", face: "soft", eyes: "sleepy", hair: "short", mouth: "flat", skin: "tan", hairColor: "silver", outfit: "forest" },
    tile: { x: 10, y: 13 },
    facing: "right",
    deckId: "deepwall",
    lines: [
      "Hm? Oh, a visitor. The fish aren't biting, so I'm just... watching the pond.",
      "Patience wins duels, child. A good wall waits. And waits.",
      "Care to test your patience against my Deepwall?",
    ],
    win: "Hohoho. You found a way through. The pond will remember this.",
    lose: "Slow and steady. Sit a while, the water teaches better than I do.",
  },
  {
    id: "kit",
    name: "Kit",
    appearance: { body: "slim", face: "sharp", eyes: "cat", hair: "short", mouth: "cat", skin: "porcelain", hairColor: "sky", outfit: "violet" },
    tile: { x: 24, y: 4 },
    facing: "left",
    deckId: "ember_rush",
    lines: [
      "Nya? You smell like a new duelist.",
      "I practiced Leap all morning. Over the walls, onto your face!",
      "Duel me! Loser buys the milk tea~",
    ],
    win: "Hmph! Fine, the milk tea's on me... just this once!",
    lose: "Ehehe, milk tea time! Your treat~",
  },
  {
    id: "suzu",
    name: "Suzu",
    appearance: { body: "slim", face: "soft", eyes: "round", hair: "long", mouth: "smile", skin: "brown", hairColor: "blossom", outfit: "ocean" },
    tile: { x: 24, y: 17 },
    facing: "down",
    deckId: "deepwall",
    lines: [
      "Oh! Welcome to my little garden. Mind the snapdragons, they bite.",
      "My monsters are like my flowers: they grow sturdy if you protect them.",
      "Shall we have a gentle duel among the petals?",
    ],
    win: "What a lovely duel! You've earned a flower crown~",
    lose: "Thank you for being so gentle with my garden. Come visit again!",
  },
];

export const npcById = (id: string): Npc | undefined => NPCS.find((n) => n.id === id);

/** The deck you play against this NPC: the other one. */
export const playerDeckAgainst = (npc: Npc): DeckChoice => (npc.deckId === "ember_rush" ? "deepwall" : "ember_rush");
