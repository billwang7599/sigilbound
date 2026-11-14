/**
 * Chibi people: the player's character and the NPCs of the world, built paper-doll style from the parts in
 * gfx/chibi-art.ts and rendered by the sculptor (gfx/sculpt.ts), so they're lit and outlined like the cards.
 *
 * Everything returns a plain canvas (no Pixi here): React shows it as an <img>, Pixi as a nearest-sampled texture.
 * Canvases are cached per appearance, facing and frame; treat them as read-only.
 *
 *  - chibiSprite(a, dir, frame): the overworld walk sprite, CHIBI_W×CHIBI_H (24×32). Frame 0 stands, 1 and 2 are
 *    the two steps (loop 1, 0, 2, 0). Feet touch CHIBI_FOOT; anchor a Pixi sprite at CHIBI_ANCHOR. No ground
 *    shadow by default: the world draws its own (so it can follow the lighting); pass { shadow: true } for a
 *    baked dithered one.
 *  - chibiPortrait(a, size): head-and-shoulders, facing the camera, size×size (48 by default), for character
 *    creation and the duel. Any size works; multiples of 24 are crispest.
 */
import {
  BODIES, EYE_PATTERNS, EYES, FACE_SPOTS, FACES, HAIR_COLORS, HAIRS, MOUTH_PATTERNS, MOUTHS, MOUTH_RED, OUTFIT_COLORS,
  SKIN_TONES, bodyPrims, bodyStrokes, hairPrims, headPrims, type Facing, type PartCtx, type Pattern,
} from "./chibi-art.js";
import { PAL } from "./palette.js";
import { render, type Prim, type Sculpture, type Stroke } from "./sculpt.js";

// ---------------------------------------------------------------------------------------------------------------
// Appearance

export interface Appearance {
  body: string;
  face: string;
  eyes: string;
  hair: string;
  mouth: string;
  skin: string;
  hairColor: string;
  outfit: string;
}
export type Slot = keyof Appearance;
export type Dir = "down" | "up" | "left" | "right";
export type Frame = 0 | 1 | 2;

/** The slots, in the order a creation screen should list them. */
export const SLOTS: readonly Slot[] = ["body", "face", "eyes", "hair", "mouth", "skin", "hairColor", "outfit"];

const LABELS: Record<Slot, Record<string, string>> = {
  body: BODIES,
  face: FACES,
  eyes: EYES,
  hair: HAIRS,
  mouth: MOUTHS,
  skin: Object.fromEntries(Object.entries(SKIN_TONES).map(([k, v]) => [k, v.label])),
  hairColor: Object.fromEntries(Object.entries(HAIR_COLORS).map(([k, v]) => [k, v.label])),
  outfit: Object.fromEntries(Object.entries(OUTFIT_COLORS).map(([k, v]) => [k, v.label])),
};

/** Every option per slot, in picker order. */
export const PARTS: Readonly<Record<Slot, readonly string[]>> = Object.fromEntries(
  SLOTS.map((s) => [s, Object.keys(LABELS[s])]),
) as unknown as Record<Slot, readonly string[]>;

/** Human names for slots and options. */
export const SLOT_LABELS: Readonly<Record<Slot, string>> = {
  body: "Body", face: "Face", eyes: "Eyes", hair: "Hair", mouth: "Mouth", skin: "Skin", hairColor: "Hair colour", outfit: "Outfit",
};
export const partLabel = (slot: Slot, id: string): string => LABELS[slot][id] ?? id;

/** The swatch colour for a colour slot's option (skin, hairColor, outfit); null for shape slots. */
export function swatch(slot: Slot, id: string): string | null {
  if (slot === "skin") return SKIN_TONES[id]?.ramp[2] ?? null;
  if (slot === "hairColor") return HAIR_COLORS[id]?.ramp[2] ?? null;
  if (slot === "outfit") return OUTFIT_COLORS[id]?.ramp[2] ?? null;
  return null;
}

export const DEFAULT_APPEARANCE: Readonly<Appearance> = Object.freeze({
  body: "slim", face: "round", eyes: "round", hair: "bob", mouth: "smile", skin: "peach", hairColor: "chestnut", outfit: "ocean",
});

export function isAppearance(x: unknown): x is Appearance {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return SLOTS.every((s) => typeof o[s] === "string" && PARTS[s].includes(o[s] as string));
}

/** Keep every valid slot, replace missing or unknown ones with the default. Never throws. */
export function normalizeAppearance(x: unknown): Appearance {
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  const out = { ...DEFAULT_APPEARANCE };
  for (const s of SLOTS) {
    const v = o[s];
    if (typeof v === "string" && PARTS[s].includes(v)) out[s] = v;
  }
  return out;
}

/** A stable string (JSON, slots in a fixed order) for saving and cache keys. */
export const serializeAppearance = (a: Appearance): string =>
  JSON.stringify(Object.fromEntries(SLOTS.map((s) => [s, a[s]])));

/** Read a saved appearance back; garbage or partial data comes back repaired (see normalizeAppearance). */
export function parseAppearance(s: unknown): Appearance {
  if (typeof s !== "string") return normalizeAppearance(s);
  try {
    return normalizeAppearance(JSON.parse(s));
  } catch {
    return normalizeAppearance(null);
  }
}

/** A deterministic random look, for NPCs and the creation screen's "randomise". */
export function randomAppearance(seed: number | string): Appearance {
  let h = 2166136261;
  const text = String(seed);
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let st = h >>> 0;
  const rnd = () => {
    st = (st + 0x6d2b79f5) >>> 0;
    let t = Math.imul(st ^ (st >>> 15), st | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = { ...DEFAULT_APPEARANCE };
  for (const s of SLOTS) out[s] = PARTS[s][Math.floor(rnd() * PARTS[s].length)]!;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Building the sculpture

export const CHIBI_W = 24;
export const CHIBI_H = 32;
/** The pixel the feet stand on, in the sprite. */
export const CHIBI_FOOT = { x: 12, y: 31 } as const;
/** Pixi anchor that puts CHIBI_FOOT on the sprite's position. */
export const CHIBI_ANCHOR = { x: CHIBI_FOOT.x / CHIBI_W, y: CHIBI_FOOT.y / CHIBI_H } as const;

interface Feature { cx: number; cy: number; pat: Pattern; mirror: boolean; colors: Record<string, string> }
interface Built { sc: Sculpture; features: Feature[] }

function ctxOf(a: Appearance, dir: Facing, frame: Frame): PartCtx {
  const n = normalizeAppearance(a);
  return {
    dir, frame,
    skin: SKIN_TONES[n.skin]!.ramp,
    hair: HAIR_COLORS[n.hairColor]!.ramp,
    outfit: OUTFIT_COLORS[n.outfit]!.ramp,
  };
}

/** The appearance as sculpted shapes plus face features, facing down, up or left, in sprite units. */
function build(a: Appearance, dir: Facing, frame: Frame): Built {
  const n = normalizeAppearance(a);
  const c = ctxOf(n, dir, frame);
  const hair = hairPrims(n.hair, c);
  const prims: Prim[] = [...hair.back, ...bodyPrims(n.body, c), ...headPrims(n.face, c), ...hair.front];
  const strokes: Stroke[] = [...bodyStrokes(n.body, c, c.outfit[1]), ...hair.strokes];
  const features: Feature[] = [];
  if (dir !== "up") {
    const spots = FACE_SPOTS[dir];
    const eye = EYE_PATTERNS[n.eyes]!;
    const colors = { k: PAL.ink, d: c.hair[1], i: c.hair[3], h: PAL.white, m: MOUTH_RED, b: SKIN_TONES[n.skin]!.blush };
    spots.eyes.forEach(([x, y], i) => features.push({ cx: x, cy: y, pat: eye, mirror: i === 1, colors }));
    const mouth = MOUTH_PATTERNS[n.mouth]!;
    const [mx, my] = spots.mouth;
    // In profile only the front half of the mouth shows.
    const half = (rows: string[]) => rows.map((r) => r.slice(0, Math.ceil(r.length / 2)));
    features.push({ cx: mx, cy: my, pat: dir === "left" ? { s: half(mouth.s), l: half(mouth.l) } : mouth, mirror: false, colors });
    for (const [x, y] of spots.blush) features.push({ cx: x, cy: y, pat: { s: ["bb"], l: ["bbb"] }, mirror: false, colors });
  }
  return { sc: { prims, strokes }, features };
}

/** Mirror (x → 24 - x) and/or shift a built chibi. */
function transform(b: Built, mirror: boolean, dy: number): Built {
  if (!mirror && !dy) return b;
  const mx = (x: number) => (mirror ? CHIBI_W - x : x);
  const prims = b.sc.prims.map((p): Prim => {
    if (p.k === "ell") return { ...p, cx: mx(p.cx), cy: p.cy + dy, rot: mirror ? -p.rot : p.rot };
    if (p.k === "poly") return { ...p, pts: p.pts.map(([x, y]) => [mx(x), y + dy]) };
    return { ...p, a: [mx(p.a[0]), p.a[1] + dy], b: [mx(p.b[0]), p.b[1] + dy] };
  });
  const strokes = (b.sc.strokes ?? []).map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [mx(x), y + dy] as [number, number]) }));
  const features = b.features.map((f) => ({ ...f, cx: mx(f.cx), cy: f.cy + dy, mirror: mirror !== f.mirror }));
  return { sc: { ...b.sc, prims, strokes }, features };
}

/** Face features as single pixels, placed on the output's own pixel grid (k output pixels per unit). */
function featurePixels(features: Feature[], k: number): [number, number, string][] {
  const big = k >= 2;
  const blk = big ? Math.max(1, Math.floor(k / 2)) : 1;
  const out: [number, number, string][] = [];
  for (const f of features) {
    const rows = big ? f.pat.l : f.pat.s;
    const cols = Math.max(...rows.map((r) => r.length));
    const x0 = Math.round(f.cx * k - (cols * blk) / 2), y0 = Math.round(f.cy * k - (rows.length * blk) / 2);
    rows.forEach((row, j) => {
      for (let i = 0; i < cols; i++) {
        const col = f.colors[row[f.mirror ? cols - 1 - i : i] ?? "."];
        if (!col) continue;
        for (let v = 0; v < blk; v++) for (let u = 0; u < blk; u++) out.push([(x0 + i * blk + u) / k, (y0 + j * blk + v) / k, col]);
      }
    });
  }
  return out;
}

/** The sculpture for a facing and frame, in sprite units (24 wide, 32 tall). For shaders or custom renders. */
export function chibiSculpture(a: Appearance, dir: Dir, frame: Frame = 0, k = 1): Sculpture {
  const b = transform(build(a, dir === "right" ? "left" : dir, frame), dir === "right", 0);
  return { ...b.sc, pixels: featurePixels(b.features, k) };
}

// ---------------------------------------------------------------------------------------------------------------
// Canvases

const cache = new Map<string, HTMLCanvasElement>();
function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = cache.get(key);
  if (!c) cache.set(key, (c = make()));
  return c;
}

/** The overworld walk sprite: 24×32, feet on CHIBI_FOOT. Frame 0 stands; 1 and 2 are the two steps. */
export function chibiSprite(a: Appearance, dir: Dir, frame: Frame = 0, opts: { shadow?: boolean } = {}): HTMLCanvasElement {
  const shadow = !!opts.shadow;
  return cached(`s:${serializeAppearance(normalizeAppearance(a))}:${dir}:${frame}:${shadow ? 1 : 0}`, () => {
    const sc = chibiSculpture(a, dir, frame, 1);
    if (shadow) sc.shadow = [CHIBI_FOOT.x, CHIBI_FOOT.y - 0.4, 6.4];
    return render(sc, CHIBI_W, CHIBI_W, CHIBI_H);
  });
}

/** Head and shoulders, facing the camera, size×size. */
export function chibiPortrait(a: Appearance, size = 48): HTMLCanvasElement {
  return cached(`p:${serializeAppearance(normalizeAppearance(a))}:${size}`, () => {
    const k = size / 24;
    const b = transform(build(a, "down", 0), false, 2);
    return render({ ...b.sc, pixels: featurePixels(b.features, k) }, size, 24, size);
  });
}

/**
 * Dev preview: a sheet of looks, one row each — the portrait, then every facing's stand and two steps.
 * Drawn 1:1; scale it up with nearest-neighbour to look at it.
 */
export function chibiSheet(looks: Appearance[]): HTMLCanvasElement {
  const dirs: Dir[] = ["down", "left", "right", "up"];
  const rowH = 50, cellW = 26;
  const c = document.createElement("canvas");
  c.width = 50 + dirs.length * 3 * cellW;
  c.height = looks.length * rowH;
  const g = c.getContext("2d")!;
  looks.forEach((a, r) => {
    g.drawImage(chibiPortrait(a, 48), 0, r * rowH);
    dirs.forEach((d, di) => {
      ([0, 1, 2] as const).forEach((f) => {
        g.drawImage(chibiSprite(a, d, f, { shadow: true }), 50 + (di * 3 + f) * cellW, r * rowH + 16);
      });
    });
  });
  return c;
}

/** A spread of looks that covers every option at least once, for the preview sheet. */
export const PREVIEW_LOOKS: Appearance[] = [
  { ...DEFAULT_APPEARANCE },
  { body: "round", face: "soft", eyes: "cat", hair: "long", mouth: "cat", skin: "porcelain", hairColor: "blossom", outfit: "violet" },
  { body: "slim", face: "sharp", eyes: "sharp", hair: "short", mouth: "flat", skin: "tan", hairColor: "ink", outfit: "crimson" },
  { body: "round", face: "round", eyes: "sleepy", hair: "ponytail", mouth: "pout", skin: "brown", hairColor: "honey", outfit: "forest" },
  { body: "slim", face: "soft", eyes: "happy", hair: "twintails", mouth: "grin", skin: "deep", hairColor: "silver", outfit: "sun" },
  { body: "round", face: "sharp", eyes: "round", hair: "short", mouth: "grin", skin: "peach", hairColor: "ember", outfit: "cocoa" },
  { body: "slim", face: "round", eyes: "cat", hair: "bob", mouth: "smile", skin: "porcelain", hairColor: "sky", outfit: "forest" },
  { body: "slim", face: "round", eyes: "round", hair: "long", mouth: "smile", skin: "tan", hairColor: "sprout", outfit: "ocean" },
];
