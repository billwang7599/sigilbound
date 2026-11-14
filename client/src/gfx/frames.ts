/**
 * Card faces as pixel canvases: frame, bevel, name banner, cost gem, art window with an affinity backdrop, the
 * parchment text panel and ATK/DEF plates. Text and numbers are not drawn here: the HUD lays DOM text over the
 * rects in `CARD_LAYOUT` (times its pixel scale), and the board draws its own digits.
 */
import { card, type CardDef } from "@sigilbound/engine";
import { AFFINITY, PAL, SPELL_FRAME } from "./palette.js";

export interface R { x: number; y: number; w: number; h: number }
export interface CardLayout {
  /** Canvas size in card pixels, and how many CSS pixels each card pixel takes in the HUD. */
  w: number; h: number; scale: number;
  /** Art size in card pixels (the art is rendered at exactly this size). */
  art: number;
  header?: R; cost?: R; name?: R; window: R; text?: R; atk?: R; def?: R; kindIcon?: R;
}

export type CardSize = "hand" | "big" | "mini" | "board" | "pile" | "tiny" | "show";

export const CARD_LAYOUT: Record<CardSize, CardLayout> = {
  hand: {
    w: 50, h: 70, scale: 2, art: 24,
    header: { x: 2, y: 2, w: 46, h: 9 }, cost: { x: 2, y: 2, w: 9, h: 9 }, name: { x: 12, y: 2, w: 34, h: 9 },
    window: { x: 4, y: 12, w: 42, h: 26 }, text: { x: 4, y: 39, w: 42, h: 21 },
    atk: { x: 24, y: 61, w: 11, h: 7 }, def: { x: 36, y: 61, w: 11, h: 7 },
  },
  big: {
    w: 126, h: 176, scale: 2, art: 48,
    header: { x: 4, y: 4, w: 118, h: 14 }, cost: { x: 4, y: 4, w: 14, h: 14 }, name: { x: 21, y: 4, w: 99, h: 14 },
    window: { x: 7, y: 20, w: 112, h: 58 }, text: { x: 7, y: 80, w: 112, h: 78 },
    atk: { x: 72, y: 160, w: 22, h: 12 }, def: { x: 97, y: 160, w: 22, h: 12 },
  },
  mini: {
    w: 36, h: 50, scale: 2, art: 18,
    header: { x: 2, y: 2, w: 32, h: 7 }, cost: { x: 2, y: 2, w: 7, h: 7 }, name: { x: 10, y: 2, w: 24, h: 7 },
    window: { x: 3, y: 10, w: 30, h: 28 },
    atk: { x: 7, y: 40, w: 11, h: 7 }, def: { x: 19, y: 40, w: 11, h: 7 },
  },
  board: { w: 56, h: 68, scale: 1, art: 48, window: { x: 3, y: 3, w: 50, h: 51 } },
  pile: { w: 28, h: 34, scale: 1, art: 22, window: { x: 2, y: 2, w: 24, h: 24 } },
  tiny: { w: 16, h: 20, scale: 1, art: 12, window: { x: 2, y: 2, w: 12, h: 12 } },
  show: { w: 64, h: 82, scale: 1, art: 48, header: { x: 2, y: 2, w: 60, h: 10 }, window: { x: 4, y: 13, w: 56, h: 52 } },
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;

function seeded(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A small pixel canvas. Pixel writes go into an ImageData buffer (a fillRect per pixel was most of the cost of
 * building a card face); reading `c` or `g` writes the buffer back first, so callers can mix both freely.
 */
export class Px {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private buf: ImageData | null = null;
  constructor(readonly w: number, readonly h: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
    this.ctx.imageSmoothingEnabled = false;
  }
  get c(): HTMLCanvasElement { this.flush(); return this.canvas; }
  get g(): CanvasRenderingContext2D { this.flush(); return this.ctx; }
  private flush(): void {
    if (this.buf) { this.ctx.putImageData(this.buf, 0, 0); this.buf = null; }
  }
  rect(x: number, y: number, w: number, h: number, col: string): this {
    const rgba = parseHex(col);
    if (!rgba) { this.g.fillStyle = col; this.g.fillRect(x, y, w, h); return this; }
    this.buf ??= this.ctx.getImageData(0, 0, this.w, this.h);
    const d = this.buf.data;
    const [r, g, b, a] = rgba;
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + w)), y1 = Math.min(this.h, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const o = (yy * this.w + xx) * 4;
        if (a === 255) { d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255; continue; }
        // Source-over, like fillRect with a translucent colour.
        const sa = a / 255, da = d[o + 3]! / 255, oa = sa + da * (1 - sa);
        if (oa <= 0) continue;
        d[o] = (r * sa + d[o]! * da * (1 - sa)) / oa;
        d[o + 1] = (g * sa + d[o + 1]! * da * (1 - sa)) / oa;
        d[o + 2] = (b * sa + d[o + 2]! * da * (1 - sa)) / oa;
        d[o + 3] = oa * 255;
      }
    }
    return this;
  }
  px(x: number, y: number, col: string): this { return this.rect(x, y, 1, 1, col); }
  /** Raised (light top-left) or sunken (dark top-left) 1px bevel inside r. */
  bevel(r: R, light: string, dark: string, sunken = false): this {
    const [a, b] = sunken ? [dark, light] : [light, dark];
    this.rect(r.x, r.y, r.w, 1, a).rect(r.x, r.y, 1, r.h, a);
    this.rect(r.x, r.y + r.h - 1, r.w, 1, b).rect(r.x + r.w - 1, r.y, 1, r.h, b);
    return this;
  }
  /**
   * A vertical two-colour gradient: solid bands with a short dithered seam between them, so it stays pixel art
   * without the all-over checker grain a full-height dither gives (that read as noise behind the art once scaled up).
   */
  gradient(r: R, top: string, bottom: string): this {
    for (let y = 0; y < r.h; y++) {
      const t = r.h <= 1 ? 0 : y / (r.h - 1);
      const k = Math.max(0, Math.min(1, (t - 0.38) / 0.24));
      for (let x = 0; x < r.w; x++) this.px(r.x + x, r.y + y, k >= 1 ? bottom : k <= 0 ? top : bayer(r.x + x, r.y + y) < k ? bottom : top);
    }
    return this;
  }
  draw(src: HTMLCanvasElement, x: number, y: number): this { this.g.drawImage(src, Math.round(x), Math.round(y)); return this; }
}

export interface FrameColors { frame: string; frameDark: string; frameLight: string; backdrop: [string, string] }
export function frameColors(def: CardDef): FrameColors {
  if (def.kind === "monster" || def.kind === "hidden") return AFFINITY[def.affinity];
  return SPELL_FRAME[def.kind];
}

/** Backdrop motifs inside the art window, by affinity or spell kind. */
function motif(p: Px, r: R, def: CardDef): void {
  const rand = seeded(def.id);
  const key = def.kind === "monster" ? def.affinity : def.kind;
  // A soft spotlight behind the art (lighter oval, dithered rim): silhouettes read against it at any size.
  {
    const cx = r.x + r.w / 2, cy = r.y + r.h * 0.5, rx = r.w * 0.46, ry = r.h * 0.44;
    const lit = frameColors(def).backdrop[1];
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
        if (d < 0.7 || (d < 1 && bayer(x, y) < (1 - d) / 0.3)) p.px(x, y, lit);
      }
    }
  }
  const n = Math.max(2, Math.floor((r.w * r.h) / 150));
  const inR = (x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  for (let i = 0; i < n; i++) {
    const x = r.x + Math.floor(rand() * r.w), y = r.y + Math.floor(rand() * r.h);
    if (key === "fire") { if (inR(x, y)) p.px(x, y, rand() < 0.3 ? PAL.fire4 : PAL.fire2); }
    else if (key === "water") { for (let k = 0; k < 3; k++) if (inR(x + k, y + (k === 1 ? -1 : 0))) p.px(x + k, y + (k === 1 ? -1 : 0), PAL.tide2); }
    else if (key === "earth") { if (inR(x, y) && inR(x + 1, y)) p.rect(x, y, 2, 1, PAL.stone1); }
    else if (key === "air") { for (let k = 0; k < 4; k++) if (inR(x + k, y)) p.px(x + k, y, PAL.gale1); }
    else if (key === "quick") { if (inR(x, y)) p.px(x, y, rand() < 0.4 ? PAL.gold3 : PAL.tide2); }
    else if (key === "prepared") { if (inR(x, y)) p.px(x, y, PAL.wood2); }
    else if (key === "ambush") { if (inR(x, y)) p.px(x, y, PAL.fire1); }
  }
  // A soft floor: a lighter band at the bottom third, so the art seems to stand on something.
  const fy = r.y + Math.floor(r.h * 0.78);
  for (let y = fy; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (bayer(x, y) < 0.35) p.px(x, y, frameColors(def).frameDark);
}

/** A small faceted gem (for costs): arcane purple. */
export function gem(p: Px, r: R): void {
  const cx = r.x + (r.w - 1) / 2, cy = r.y + (r.h - 1) / 2, rad = Math.min(r.w, r.h) / 2;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const d = Math.abs(x - cx) + Math.abs(y - cy);
      if (d > rad + 0.2) continue;
      const edge = d > rad - 1;
      const lit = x - cx + (y - cy) < 0;
      p.px(x, y, edge ? PAL.ink : lit ? (x - cx + y - cy < -rad * 0.6 ? PAL.gale4 : PAL.arc3) : PAL.arc2);
    }
  }
}

/** The ATK (red, sword) or DEF (blue, shield) plate. */
function plate(p: Px, r: R, kind: "atk" | "def"): void {
  const base = kind === "atk" ? PAL.fire1 : PAL.tide1, light = kind === "atk" ? PAL.fire2 : PAL.tide2;
  p.rect(r.x, r.y, r.w, r.h, PAL.ink).rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, base).bevel({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, light, PAL.ink);
}

function corner(p: Px, x: number, y: number, col: string, hi: string): void {
  p.px(x, y, col).px(x + 1, y, col).px(x, y + 1, col).px(x, y, hi);
}

const hexCache = new Map<string, [number, number, number, number] | null>();
/** "#rgb", "#rrggbb" or "#rrggbbaa" → rgba bytes; anything else (named colours, rgba()) → null. */
function parseHex(col: string): [number, number, number, number] | null {
  let v = hexCache.get(col);
  if (v !== undefined) return v;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(col);
  if (!m) v = null;
  else {
    let h = m[1]!;
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255];
  }
  hexCache.set(col, v);
  return v;
}

const faces = new Map<string, HTMLCanvasElement>();

/** A card face (frame, banner, gem, backdrop, panels) without text, at the given layout. Art is included. */
export function cardFaceCanvas(id: string, size: CardSize, art: (id: string, px: number) => HTMLCanvasElement): HTMLCanvasElement {
  const key = `${id}|${size}`;
  const hit = faces.get(key);
  if (hit) return hit;
  const def = card(id);
  const L = CARD_LAYOUT[size];
  const col = frameColors(def);
  const p = new Px(L.w, L.h);
  // Frame: ink outline, the frame colour with a raised bevel, and a darker inner rim.
  p.rect(0, 0, L.w, L.h, PAL.ink);
  p.rect(1, 1, L.w - 2, L.h - 2, col.frame);
  p.bevel({ x: 1, y: 1, w: L.w - 2, h: L.h - 2 }, col.frameLight, col.frameDark);
  // Texture on the frame: a faint ordered pattern so it isn't a flat slab.
  for (let y = 2; y < L.h - 2; y++) for (let x = 2; x < L.w - 2; x++) if ((x * 3 + y * 5) % 11 === 0) p.px(x, y, col.frameDark);
  // Kind-specific trims.
  if (def.kind === "ambush") {
    for (let x = 4; x < L.w - 4; x += 4) { p.px(x, 0, PAL.fire0).px(x, L.h - 1, PAL.fire0).px(x, 1, PAL.red); }
  } else if (def.kind === "prepared") {
    for (const [x, y] of [[2, 2], [L.w - 4, 2], [2, L.h - 4], [L.w - 4, L.h - 4]] as const) corner(p, x, y, PAL.paper4, PAL.paper2);
  } else if (def.kind === "quick") {
    for (const [x, y] of [[2, 2], [L.w - 4, 2], [2, L.h - 4], [L.w - 4, L.h - 4]] as const) corner(p, x, y, PAL.gold2, PAL.gold4);
  } else {
    for (const [x, y] of [[2, 2], [L.w - 4, 2], [2, L.h - 4], [L.w - 4, L.h - 4]] as const) corner(p, x, y, PAL.gold2, PAL.gold4);
  }
  // Name banner and cost gem.
  if (L.header) {
    const h = L.header;
    p.rect(h.x, h.y, h.w, h.h, PAL.ink).rect(h.x + 1, h.y + 1, h.w - 2, h.h - 2, PAL.night);
    p.rect(h.x + 1, h.y + 1, h.w - 2, 1, PAL.plum);
  }
  if (L.cost) gem(p, L.cost);
  // Art window: sunken, backdrop gradient + motif, art centred on the floor.
  const wnd = L.window;
  p.rect(wnd.x - 1, wnd.y - 1, wnd.w + 2, wnd.h + 2, PAL.ink);
  p.gradient(wnd, col.backdrop[0], col.backdrop[1]);
  motif(p, wnd, def);
  if (def.kind !== "hidden") {
    const a = art(id, L.art);
    const ax = wnd.x + Math.floor((wnd.w - a.width) / 2);
    const ay = def.kind === "monster" ? wnd.y + wnd.h - a.height - Math.max(0, Math.floor((wnd.h - a.height) * 0.15)) : wnd.y + Math.floor((wnd.h - a.height) / 2);
    p.g.save();
    p.g.beginPath();
    p.g.rect(wnd.x, wnd.y, wnd.w, wnd.h);
    p.g.clip();
    p.draw(a, ax, ay);
    p.g.restore();
  }
  // Inner shadow along the top and left of the window (it's recessed).
  for (let x = wnd.x; x < wnd.x + wnd.w; x++) if (bayer(x, wnd.y) < 0.75) p.px(x, wnd.y, PAL.ink);
  for (let y = wnd.y; y < wnd.y + wnd.h; y++) if (bayer(wnd.x, y) < 0.5) p.px(wnd.x, y, PAL.ink);
  // Parchment text panel.
  if (L.text) {
    const t = L.text;
    p.rect(t.x - 1, t.y - 1, t.w + 2, t.h + 2, PAL.ink).rect(t.x, t.y, t.w, t.h, PAL.paper);
    p.bevel(t, PAL.white, PAL.paper3);
    for (let y = t.y + 1; y < t.y + t.h - 1; y++) for (let x = t.x + 1; x < t.x + t.w - 1; x++) if (((x * 7 + y * 13) % 29) === 0) p.px(x, y, PAL.paper2);
  }
  if (def.kind === "monster") {
    if (L.atk) plate(p, L.atk, "atk");
    if (L.def) plate(p, L.def, "def");
  }
  faces.set(key, p.c);
  return p.c;
}
