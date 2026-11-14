/**
 * Chibi part data: the paper-doll pieces people in the world are built from (body, face shape, eyes, hair, mouth)
 * and the colour ramps they're painted with. Everything is code-drawn with the sculptor (gfx/sculpt.ts), so people
 * are lit and outlined like the monsters and cards.
 *
 * Geometry is in sprite units: a 24×32 box, one unit = one pixel of the overworld sprite, feet on y≈31, facing the
 * camera ("down"). "up" is the back, "left" the side profile; "right" is "left" mirrored (see chibi.ts).
 * Face features (eyes, mouth, blush) are pixel patterns, drawn at the output's own resolution in chibi.ts.
 *
 * Skin and hair need warmer, pinker tones than the board palette has, so they get ramps of their own here
 * (outline → shadow → base → light → highlight, like RAMPS). Everything else picks from PAL / RAMPS.
 */
import { RAMPS, type Ramp5 } from "./palette.js";
import { ell, limb, poly, stroke, type Mat, type Prim, type Stroke } from "./sculpt.js";

export type Facing = "down" | "up" | "left";

// ---------------------------------------------------------------------------------------------------------------
// Colours

export interface SkinTone { label: string; ramp: Ramp5; blush: string }
export const SKIN_TONES: Record<string, SkinTone> = {
  porcelain: { label: "Porcelain", ramp: ["#7a4a4a", "#e6b0a0", "#fad6c6", "#ffe9df", "#fff7f2"], blush: "#f59ea6" },
  peach: { label: "Peach", ramp: ["#6e3e36", "#e0a084", "#f6c4a4", "#ffdcc2", "#fff0e2"], blush: "#ef8a8c" },
  tan: { label: "Tan", ramp: ["#583224", "#b97a56", "#d9a074", "#eebf92", "#f9dbb6"], blush: "#e2766c" },
  brown: { label: "Brown", ramp: ["#3a2219", "#80503a", "#a8714e", "#c69068", "#e0b088"], blush: "#cf625a" },
  deep: { label: "Deep", ramp: ["#24150f", "#553424", "#764c34", "#966548", "#b98660"], blush: "#b0524a" },
};

export interface ColorDef { label: string; ramp: Ramp5 }
export const HAIR_COLORS: Record<string, ColorDef> = {
  ink: { label: "Ink", ramp: RAMPS.ash },
  chestnut: { label: "Chestnut", ramp: RAMPS.bark },
  honey: { label: "Honey", ramp: RAMPS.gold },
  ember: { label: "Ember", ramp: RAMPS.fire },
  sky: { label: "Sky", ramp: RAMPS.water },
  silver: { label: "Silver", ramp: RAMPS.cloud },
  sprout: { label: "Sprout", ramp: RAMPS.moss },
  blossom: { label: "Blossom", ramp: ["#4a1a34", "#a3456e", "#de739c", "#f5a8c6", "#ffd9e8"] },
};

export const OUTFIT_COLORS: Record<string, ColorDef> = {
  crimson: { label: "Crimson", ramp: RAMPS.fire },
  ocean: { label: "Ocean", ramp: RAMPS.water },
  forest: { label: "Forest", ramp: RAMPS.moss },
  violet: { label: "Violet", ramp: RAMPS.arcane },
  sun: { label: "Sun", ramp: RAMPS.gold },
  cocoa: { label: "Cocoa", ramp: RAMPS.bark },
};

/** Legs/leggings and shoes are the same for everyone, so outfits read by their tunic colour. */
export const LEGS: Mat = RAMPS.ink;
export const SHOES: Mat = RAMPS.bark;
/** The inside of an open mouth. */
export const MOUTH_RED = "#c0404c";

// ---------------------------------------------------------------------------------------------------------------
// Parts

export const BODIES = { slim: "Slim", round: "Round" } as const;
export const FACES = { round: "Round", soft: "Soft", sharp: "Sharp" } as const;
export const EYES = { round: "Round", cat: "Cat", sharp: "Sharp", sleepy: "Sleepy", happy: "Happy" } as const;
export const HAIRS = { short: "Short", bob: "Bob", long: "Long", ponytail: "Ponytail", twintails: "Twintails" } as const;
export const MOUTHS = { smile: "Smile", grin: "Grin", flat: "Flat", pout: "Pout", cat: "Cat" } as const;

/** What a part builder gets: the facing, the walk frame, and the materials to paint with. */
export interface PartCtx { dir: Facing; frame: 0 | 1 | 2; skin: Ramp5; hair: Ramp5; outfit: Ramp5 }

/** A sculpture fragment: shapes behind the head/body, shapes in front, and detail strokes. */
export interface Layered { back: Prim[]; front: Prim[]; strokes: Stroke[] }
const empty = (): Layered => ({ back: [], front: [], strokes: [] });

/** Points around an ellipse arc, degrees (0 = right, 90 = down), as a flat [x, y, ...] list. */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 12): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return out;
}

/** Mirror a flat point list around x = 12 (the sprite's centre line). */
const mirrorPts = (pts: number[]): number[] => pts.map((v, i) => (i % 2 === 0 ? 24 - v : v));

// --- Body: legs, torso, arms ----------------------------------------------------------------------------------

/** Body (legs, torso, arms) for a facing and walk frame. Walking lifts one foot and swings the arms. */
export function bodyPrims(body: string, c: PartCtx): Prim[] {
  const round = body === "round";
  const step = c.frame === 0 ? 0 : c.frame === 1 ? 1 : -1;
  const out: Prim[] = [];
  if (c.dir === "left") {
    // Profile: legs scissor, one arm swings across the body.
    const fx = 11.5 - step * 2, bx = 12.5 + step * 2;
    out.push(limb(12.5, 25, bx, 29.6, 2.6, LEGS), ell(bx - 0.6, 30.2, 1.9, 1.2, SHOES));
    out.push(limb(11.5, 25, fx, 29.6, 2.6, LEGS), ell(fx - 0.6, 30.2, 1.9, 1.2, SHOES));
    if (round) out.push(ell(12, 21.9, 5.2, 4.6, c.outfit));
    else out.push(poly([9.6, 17.6, 14.4, 17.6, 15.6, 25.6, 8.4, 25.6], c.outfit));
    const hx = 12 + step * 2.2;
    out.push(limb(12, 18.8, (12 + hx) / 2, 21.4, 2.8, c.outfit), limb((12 + hx) / 2, 21.4, hx, 23.6, 2.4, c.skin, 2.4, { edge: false }));
    return out;
  }
  // Facing the camera or away: legs side by side, the stepping foot lifts.
  const lL = step === 1 ? 1.4 : 0, lR = step === -1 ? 1.4 : 0;
  out.push(limb(10, 25, 10, 29.6 - lL, 2.6, LEGS), ell(10, 30.2 - lL, 1.8, 1.2, SHOES));
  out.push(limb(14, 25, 14, 29.6 - lR, 2.6, LEGS), ell(14, 30.2 - lR, 1.8, 1.2, SHOES));
  if (round) out.push(ell(12, 22, 6.2, 4.7, c.outfit));
  else out.push(poly([8.6, 17.6, 15.4, 17.6, 17, 25.6, 7, 25.6], c.outfit));
  // Arms swing opposite to the legs: the arm on the lifted side goes back (up a little).
  const w = round ? 1.2 : 0.4;
  const aL = step === -1 ? -1 : step === 1 ? 0.6 : 0, aR = step === 1 ? -1 : step === -1 ? 0.6 : 0;
  out.push(limb(8.2 - w, 18.6, 7.2 - w, 21, 2.8, c.outfit), limb(7.2 - w, 21, 6.6 - w, 23.6 + aL, 2.4, c.skin, 2.4, { edge: false }));
  out.push(limb(15.8 + w, 18.6, 16.8 + w, 21, 2.8, c.outfit), limb(16.8 + w, 21, 17.4 + w, 23.6 + aR, 2.4, c.skin, 2.4, { edge: false }));
  return out;
}

/** Collar and belt details on the torso. */
export function bodyStrokes(body: string, c: PartCtx, ink: string): Stroke[] {
  const round = body === "round";
  if (c.dir === "up") return [stroke([9, 23.5, 15, 23.5], ink)];
  if (c.dir === "left") return [stroke([10, 23.5, 14, 23.5], ink)];
  return [stroke([10.5, 18.2, 12, 19.6, 13.5, 18.2], ink), stroke(round ? [7, 23.5, 17, 23.5] : [8, 23.5, 16, 23.5], ink)];
}

// --- Head ------------------------------------------------------------------------------------------------------

/** The head (skin), by face shape. The jaw shapes add a chin under the skull. */
export function headPrims(face: string, c: PartCtx): Prim[] {
  if (c.dir === "left") {
    const out: Prim[] = [ell(12, 10.8, 7.9, 7.4, c.skin)];
    if (face === "soft") out.push(poly([5, 11, 16, 11, 15, 16.8, 9, 18.4, 5.6, 16], c.skin, { edge: false }));
    if (face === "sharp") out.push(poly([4.8, 11, 16, 11, 14, 16.6, 7.5, 18.6, 5.2, 15.6], c.skin, { edge: false }));
    return out;
  }
  if (face === "soft") {
    return [ell(12, 10.6, 8.2, 7, c.skin), poly([4.1, 10.6, 19.9, 10.6, 19.2, 15.6, 16.2, 18.2, 7.8, 18.2, 4.8, 15.6], c.skin, { edge: false })];
  }
  if (face === "sharp") {
    return [ell(12, 10.4, 8, 7, c.skin), poly([4.2, 10.4, 19.8, 10.4, 17.6, 15.6, 12, 18.8, 6.4, 15.6], c.skin, { edge: false })];
  }
  return [ell(12, 10.9, 8.1, 7.5, c.skin)];
}

// --- Hair ------------------------------------------------------------------------------------------------------

/** The top of the hair seen from the front, with a jagged fringe. `side` is how far down the temples it comes. */
function capFront(side: number): number[] {
  return [
    ...arc(12, 10.6, 9.2, 8.6, 180, 360, 14),
    21.2, side, 19.6, side + 0.4, 18.8, 10.4,
    17.4, 10.6, 16, 8.6, 14.4, 10, 12.8, 8.2, 11.2, 9.8, 9.6, 8.2, 8, 10, 6.6, 8.8, 5.2, 10.4,
    4.4, side + 0.4, 2.8, side,
  ];
}

/** The hair seen from the side (facing left): over the top and down the back, fringe at the front. */
function capSide(nape: number): number[] {
  return [
    ...arc(12, 10.6, 9.2, 8.6, 185, 395, 16),
    18.6, nape, 15.6, nape + 0.4, 15, 13.4, 13.6, 11.4,
    11.4, 9.8, 9.8, 8.4, 8.4, 10, 6.6, 8.4, 5.2, 10, 3.4, 10.4,
  ];
}

/** Hair, by style: what goes behind the head and body, what goes over the face, and strand lines. */
export function hairPrims(style: string, c: PartCtx): Layered {
  const H = c.hair;
  const out = empty();
  const strands = (pts: number[][]) => out.strokes.push(...pts.map((p) => stroke(p, H[1])));
  if (c.dir === "down") {
    const side = style === "short" ? 13.6 : style === "bob" ? 15 : 14;
    out.front.push(poly(capFront(side), H));
    strands([[12.8, 3.6, 12, 7.4], [9, 4.8, 8, 8], [16.4, 4.8, 17.2, 8]]);
    if (style === "bob") {
      out.back.push(ell(12, 12.6, 9.6, 6.8, H));
      out.front.push(poly([2.6, 9, 5.6, 9, 6.4, 17.2, 4.4, 18.4, 2.4, 16.8], H));
      out.front.push(poly(mirrorPts([2.6, 9, 5.6, 9, 6.4, 17.2, 4.4, 18.4, 2.4, 16.8]), H));
    } else if (style === "long") {
      out.back.push(poly([3.4, 8, 20.6, 8, 21.6, 22, 20.4, 24.6, 3.6, 24.6, 2.4, 22], H));
      out.front.push(poly([2.8, 9.4, 5.8, 9.4, 6.2, 18, 5.2, 22.6, 3.2, 21.6, 2.4, 17], H));
      out.front.push(poly(mirrorPts([2.8, 9.4, 5.8, 9.4, 6.2, 18, 5.2, 22.6, 3.2, 21.6, 2.4, 17]), H));
    } else if (style === "ponytail") {
      out.back.push(ell(20.6, 15.2, 2.8, 6.4, H, { rot: -0.25 }));
      out.back.push(ell(19, 7.6, 2.6, 2.4, PAL_TIE));
    } else if (style === "twintails") {
      out.back.push(ell(2.4, 15.6, 2.6, 6, H, { rot: 0.2 }), ell(21.6, 15.6, 2.6, 6, H, { rot: -0.2 }));
      out.front.push(ell(3.6, 9.8, 1.6, 1.6, PAL_TIE), ell(20.4, 9.8, 1.6, 1.6, PAL_TIE));
    }
    return out;
  }
  if (c.dir === "up") {
    // The back of the head is all hair.
    const low = style === "short" ? 15.6 : 17.6;
    out.front.push(poly([...arc(12, 10.6, 9.2, 8.6, 180, 360, 14), 21.2, 12, 20, low - 1, 16, low, 8, low, 4, low - 1, 2.8, 12], H));
    strands([[12, 3.6, 12, low - 2], [8.4, 5, 7.4, low - 3], [15.6, 5, 16.6, low - 3]]);
    if (style === "bob") out.front.push(poly([2.6, 10, 21.4, 10, 21.2, 17.4, 18.6, 18.6, 5.4, 18.6, 2.8, 17.4], H));
    if (style === "long") out.front.push(poly([3.2, 10, 20.8, 10, 21.4, 22.6, 19.6, 24.8, 4.4, 24.8, 2.6, 22.6], H));
    if (style === "ponytail") out.front.push(ell(12, 19.2, 2.9, 5.8, H), ell(12, 13.6, 1.8, 1.4, PAL_TIE));
    if (style === "twintails") {
      out.front.push(ell(3, 16.4, 2.6, 6, H, { rot: 0.2 }), ell(21, 16.4, 2.6, 6, H, { rot: -0.2 }));
      out.front.push(ell(4.4, 10.6, 1.6, 1.6, PAL_TIE), ell(19.6, 10.6, 1.6, 1.6, PAL_TIE));
    }
    return out;
  }
  // Profile, facing left.
  const nape = style === "short" ? 15 : 17;
  out.front.push(poly(capSide(nape), H));
  strands([[12, 3.4, 15, 9], [16.6, 5, 18.4, 11]]);
  if (style === "bob") out.front.push(poly([14.6, 11, 21.2, 10.4, 21, 17.4, 18.6, 18.6, 15, 18.4], H));
  if (style === "long") out.front.push(poly([14.4, 10.4, 21.2, 10.4, 21.6, 22, 20, 24.6, 15.4, 24, 14.6, 17], H));
  if (style === "ponytail") {
    out.back.push(ell(21.8, 13.6, 2.6, 6, H, { rot: -0.45 }));
    out.front.push(ell(19.6, 8.6, 1.8, 1.8, PAL_TIE));
  }
  if (style === "twintails") {
    out.back.push(ell(19.2, 17, 2.6, 6, H, { rot: -0.25 }));
    out.front.push(ell(18.2, 11, 1.6, 1.6, PAL_TIE));
  }
  return out;
}

/** Hair ties and ribbons. */
const PAL_TIE: Mat = RAMPS.fire;

// ---------------------------------------------------------------------------------------------------------------
// Face features: pixel patterns, drawn at the output's resolution.
//   k = lash/ink   d = iris dark   i = iris light   h = white glint   m = inside of the mouth   . = nothing
// "s" patterns are for the 1:1 overworld sprite; "l" patterns for big views (portraits), scaled by whole pixels.

export interface Pattern { s: string[]; l: string[] }

/** Eyes, drawn for the eye on the viewer's left; the other eye is mirrored. */
export const EYE_PATTERNS: Record<string, Pattern> = {
  round: {
    s: ["kkk", "hdd", "ddi", ".i."],
    l: [".kkkk.", "kkkkkk", "dhhddd", "dhhddd", "dddidd", "ddiiid", ".iiii."],
  },
  cat: {
    s: ["k..", "khd", ".di"],
    l: ["k.....", "kkkkk.", ".hhddd", ".hdddd", ".ddiid", "..iii."],
  },
  sharp: {
    s: ["kkk", "hdd", ".i."],
    l: ["kkkkkk", ".hhddk", ".hdddd", "..iid."],
  },
  sleepy: {
    s: ["...", "kkk", "ddi"],
    l: ["......", "......", "kkkkkk", ".dddid", "..iii."],
  },
  happy: {
    s: [".k.", "k.k"],
    l: ["..kk..", ".k..k.", "k....k"],
  },
};

export const MOUTH_PATTERNS: Record<string, Pattern> = {
  smile: { s: ["k.k", ".k."], l: ["k...k", ".kkk."] },
  grin: { s: ["kkk", ".m."], l: ["kkkkk", "kmmmk", ".kmk."] },
  flat: { s: ["kk"], l: ["kkk"] },
  pout: { s: [".k.", "k.k"], l: [".kk.", "k..k"] },
  cat: { s: ["k.k.k", ".k.k."], l: ["k..k..k", ".kk.kk."] },
};

/** Where features sit, in sprite units, for the eye on the viewer's left (the other mirrors), mouth and blush. */
export const FACE_SPOTS = {
  down: { eyes: [[8.4, 13.2], [15.6, 13.2]], mouth: [12, 16], blush: [[6, 15.4], [18, 15.4]] },
  left: { eyes: [[6.6, 13.2]], mouth: [5.4, 16], blush: [[9, 15.4]] },
} as const;
