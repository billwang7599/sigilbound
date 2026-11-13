/**
 * The one palette everything is drawn from: 48 colours, grouped into 5-step ramps
 * (outline → shadow → base → light → highlight). Sprites, card frames, the board, particles and the HUD theme
 * (styles.css mirrors the UI colours) all pick from here, so the game reads as one piece.
 *
 * Each Crest has an accent: Ember (fire), Tide (water), Stone (earth), Gale (air).
 */
import type { Affinity, FieldId } from "@sigilbound/engine";

/** The full palette, by name. Keep it at 48 entries or fewer. */
export const PAL = {
  // Night / UI darks
  ink: "#14121c", night: "#1f1b2e", dusk: "#2e2842", plum: "#463a5e", mauve: "#6b5a85", lilac: "#9d8bc0",  white: "#ffffff",
  // Parchment
  paper: "#fff3d6", paper2: "#f0dcae", paper3: "#d4b47f", paper4: "#9c7a4e",
  // Wood
  wood0: "#2a1910", wood1: "#47291a", wood2: "#6b4226", wood3: "#925f37", wood4: "#bb8650",
  // Ember (fire)
  fire0: "#3a0f12", fire1: "#7d1f1c", fire2: "#bf3a22", fire3: "#ec6a2c", fire4: "#ffa443", fire5: "#ffe08a",
  // Tide (water)
  tide0: "#0e1c38", tide1: "#1b3f6f", tide2: "#2868a8", tide3: "#3fa2d9", tide4: "#86d6f2", tide5: "#d6f6ff",
  // Stone (earth)
  stone0: "#1c1914", stone1: "#3e372c", stone2: "#655a48", stone3: "#93846a", stone4: "#c7b894",
  moss1: "#2f4a1e", moss2: "#4e7a2a", moss3: "#7fae3a", moss4: "#c4de6c",
  // Gale (air)
  gale1: "#4a5288", gale2: "#7b8cc4", gale3: "#b4c6ea", gale4: "#eef4ff",
  // Gold / Sigil arcane
  gold1: "#7a5214", gold2: "#c48a22", gold3: "#f2c24e", gold4: "#fff0a6",
  arc2: "#7b4fc4", arc3: "#b58cff",
  // Signals
  red: "#e0483c",
} as const;
export type PalName = keyof typeof PAL;

/** 5-step ramps for sculpted art: [outline, shadow, base, light, highlight]. */
export type Ramp5 = readonly [string, string, string, string, string];
export const RAMPS = {
  fire: [PAL.fire0, PAL.fire1, PAL.fire2, PAL.fire3, PAL.fire4],
  flame: [PAL.fire1, PAL.fire3, PAL.fire4, PAL.fire5, PAL.white],
  water: [PAL.tide0, PAL.tide1, PAL.tide2, PAL.tide3, PAL.tide4],
  foam: [PAL.tide1, PAL.tide3, PAL.tide4, PAL.tide5, PAL.white],
  air: [PAL.dusk, PAL.gale1, PAL.gale2, PAL.gale3, PAL.gale4],
  cloud: [PAL.gale1, PAL.gale2, PAL.gale3, PAL.gale4, PAL.white],
  stone: [PAL.stone0, PAL.stone1, PAL.stone2, PAL.stone3, PAL.stone4],
  moss: [PAL.stone0, PAL.moss1, PAL.moss2, PAL.moss3, PAL.moss4],
  bark: [PAL.wood0, PAL.wood1, PAL.wood2, PAL.wood3, PAL.wood4],
  ash: [PAL.ink, PAL.dusk, PAL.plum, PAL.mauve, PAL.lilac],
  bone: [PAL.stone1, PAL.paper4, PAL.paper3, PAL.paper2, PAL.paper],
  gold: [PAL.wood0, PAL.gold1, PAL.gold2, PAL.gold3, PAL.gold4],
  brick: [PAL.fire0, PAL.wood1, PAL.fire1, PAL.wood3, PAL.paper3],
  arcane: [PAL.ink, PAL.plum, PAL.arc2, PAL.arc3, PAL.gale4],
  ink: [PAL.ink, PAL.ink, PAL.night, PAL.dusk, PAL.plum],
} as const satisfies Record<string, Ramp5>;
export type MatName = keyof typeof RAMPS;

export type Ramp = [outline: string, shadow: string, base: string, light: string];

/** Per-affinity colours: sprite ramps, card frame colours, and the Crest accent glow. */
export const AFFINITY: Record<Affinity, {
  body: Ramp; accent: Ramp; frame: string; frameDark: string; frameLight: string; accentGlow: string; backdrop: [string, string];
}> = {
  fire: {
    body: [PAL.fire0, PAL.fire1, PAL.fire2, PAL.fire3], accent: [PAL.fire1, PAL.fire3, PAL.fire4, PAL.fire5],
    frame: PAL.fire2, frameDark: PAL.fire0, frameLight: PAL.fire4, accentGlow: PAL.fire4, backdrop: [PAL.fire0, PAL.fire1],
  },
  water: {
    body: [PAL.tide0, PAL.tide1, PAL.tide2, PAL.tide3], accent: [PAL.tide1, PAL.tide3, PAL.tide4, PAL.tide5],
    frame: PAL.tide2, frameDark: PAL.tide0, frameLight: PAL.tide4, accentGlow: PAL.tide3, backdrop: [PAL.tide0, PAL.tide1],
  },
  earth: {
    body: [PAL.stone0, PAL.stone1, PAL.stone2, PAL.stone3], accent: [PAL.stone0, PAL.moss2, PAL.moss3, PAL.moss4],
    frame: PAL.moss2, frameDark: PAL.stone0, frameLight: PAL.moss4, accentGlow: PAL.moss3, backdrop: [PAL.stone0, PAL.moss1],
  },
  air: {
    body: [PAL.dusk, PAL.gale1, PAL.gale2, PAL.gale3], accent: [PAL.gale1, PAL.gale2, PAL.gale3, PAL.gale4],
    frame: PAL.gale2, frameDark: PAL.dusk, frameLight: PAL.gale4, accentGlow: PAL.gale3, backdrop: [PAL.dusk, PAL.gale1],
  },
  neutral: {
    body: [PAL.ink, PAL.stone1, PAL.stone2, PAL.stone3], accent: [PAL.ink, PAL.gold2, PAL.gold3, PAL.gold4],
    frame: PAL.stone2, frameDark: PAL.ink, frameLight: PAL.stone4, accentGlow: PAL.gold3, backdrop: [PAL.ink, PAL.dusk],
  },
};

/** The Crest accents, for glows, frames and UI touches. */
export const CREST_ACCENT = { ember: PAL.fire4, tide: PAL.tide3, stone: PAL.moss3, gale: PAL.gale3 } as const;

/** Spell frames, by kind. */
export const SPELL_FRAME: Record<"quick" | "prepared" | "ambush", { frame: string; frameDark: string; frameLight: string; backdrop: [string, string] }> = {
  quick: { frame: PAL.tide2, frameDark: PAL.ink, frameLight: PAL.gold3, backdrop: [PAL.night, PAL.tide1] },
  prepared: { frame: PAL.wood3, frameDark: PAL.wood0, frameLight: PAL.paper2, backdrop: [PAL.wood0, PAL.wood1] },
  ambush: { frame: PAL.fire1, frameDark: PAL.fire0, frameLight: PAL.red, backdrop: [PAL.ink, PAL.fire0] },
};

export const UI = {
  ink: PAL.ink,
  paper: PAL.paper,
  paperDark: PAL.paper3,
  wood: PAL.wood2,
  woodDark: PAL.wood1,
  woodLight: PAL.wood3,
  gold: PAL.gold3,
  red: PAL.red,
  green: PAL.moss3,
  blue: PAL.tide3,
  shadow: "#00000055",
  highlight: PAL.gold4,
  target: "#ff6b5b",
};

/** Field tiles (fields are off by default; kept so they can come back). */
export const FIELD_TILES: Record<FieldId, { base: string; specks: string[]; label: string }> = {
  crossroads: { base: PAL.moss2, specks: [PAL.moss1, PAL.moss3, PAL.stone3, PAL.paper4], label: PAL.ink },
  volcano: { base: PAL.fire0, specks: [PAL.fire1, PAL.stone0, PAL.fire3, PAL.fire4], label: PAL.fire5 },
  deep_lake: { base: PAL.tide2, specks: [PAL.tide1, PAL.tide3, PAL.tide4, PAL.tide0], label: PAL.tide5 },
  old_forest: { base: PAL.moss1, specks: [PAL.moss2, PAL.stone0, PAL.moss3, PAL.wood2], label: PAL.moss4 },
  mountain_pass: { base: PAL.stone2, specks: [PAL.stone1, PAL.stone3, PAL.stone0, PAL.stone4], label: PAL.ink },
  storm_peak: { base: PAL.gale1, specks: [PAL.dusk, PAL.gale2, PAL.gale3, PAL.ink], label: PAL.gale4 },
};

/** "#rrggbb" → 0xrrggbb, for Pixi. */
export const hexNum = (s: string): number => parseInt(s.replace("#", "").slice(0, 6), 16);
