/**
 * A tiny pixel-art "sculptor": art is described as layered shapes (ellipses, polygons, limbs, rects), each with a
 * material ramp from the palette. Rendering rasterises them at the target size and shades every pixel from a
 * fake surface normal, lit from the top left, then adds 1px coloured outlines, part-separation lines, eyes and
 * detail strokes. The result is crisp, consistently lit sprites with no copied art.
 *
 * Shape definitions live in gfx/art.ts. Any of them can later be swapped for a hand-drawn PNG.
 */
import { PAL, RAMPS, type MatName } from "./palette.js";

type Vec = [number, number];

interface Base { mat: MatName; flat?: number; edge?: boolean; shine?: boolean }
interface Ell extends Base { k: "ell"; cx: number; cy: number; rx: number; ry: number; rot: number }
interface Poly extends Base { k: "poly"; pts: Vec[] }
interface Limb extends Base { k: "limb"; a: Vec; b: Vec; w0: number; w1: number }
export type Prim = Ell | Poly | Limb;

export interface Eye { x: number; y: number; s: number; glow?: string; look?: -1 | 1 }
export interface Stroke { pts: Vec[]; color: string; onlyOnBody?: boolean }
export interface Sculpture {
  prims: Prim[];
  eyes?: Eye[];
  strokes?: Stroke[];
  /** Ground shadow under the feet: [cx, cy, rx]. */
  shadow?: [number, number, number];
  /** Single pixels drawn last, e.g. sparkles or glints: [x, y, color]. */
  pixels?: [number, number, string][];
}

type Opt = Partial<Pick<Base, "flat" | "edge" | "shine">> & { rot?: number };
export const ell = (cx: number, cy: number, rx: number, ry: number, mat: MatName, o: Opt = {}): Prim =>
  ({ k: "ell", cx, cy, rx, ry, rot: o.rot ?? 0, mat, ...o });
export const poly = (pts: number[], mat: MatName, o: Opt = {}): Prim => {
  const v: Vec[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) v.push([pts[i]!, pts[i + 1]!]);
  return { k: "poly", pts: v, mat, ...o };
};
export const limb = (x0: number, y0: number, x1: number, y1: number, w0: number, mat: MatName, w1 = w0, o: Opt = {}): Prim =>
  ({ k: "limb", a: [x0, y0], b: [x1, y1], w0, w1, mat, ...o });
export const stroke = (pts: number[], color: string, onlyOnBody = true): Stroke => {
  const v: Vec[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) v.push([pts[i]!, pts[i + 1]!]);
  return { pts: v, color, onlyOnBody };
};

const rgbCache = new Map<string, [number, number, number]>();
function rgbOf(col: string): [number, number, number] {
  let v = rgbCache.get(col);
  if (!v) {
    const h = col.replace("#", "");
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    rgbCache.set(col, v);
  }
  return v;
}

/** Light comes from the top left and a little toward the viewer. */
const LIGHT = (() => { const l = [-0.5, -0.66, 0.56]; const n = Math.hypot(...l); return l.map((x) => x / n) as [number, number, number]; })();

function hit(p: Prim, x: number, y: number): [number, number, number] | null {
  if (p.k === "ell") {
    const c = Math.cos(-p.rot), s = Math.sin(-p.rot);
    const dx = x - p.cx, dy = y - p.cy;
    const u = (dx * c - dy * s) / p.rx, v = (dx * s + dy * c) / p.ry;
    const d = u * u + v * v;
    if (d > 1) return null;
    const cr = Math.cos(p.rot), sr = Math.sin(p.rot);
    return [u * cr - v * sr, u * sr + v * cr, Math.sqrt(Math.max(0, 1 - d))];
  }
  if (p.k === "poly") {
    let inside = false;
    const pts = p.pts;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]!, [xj, yj] = pts[j]!;
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (!inside) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [px, py] of pts) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
    const u = Math.max(-1, Math.min(1, (x - (x0 + x1) / 2) / Math.max(1, (x1 - x0) / 2)));
    const v = Math.max(-1, Math.min(1, (y - (y0 + y1) / 2) / Math.max(1, (y1 - y0) / 2)));
    const d = Math.min(1, (u * u + v * v) * 0.7);
    return [u * 0.8, v * 0.8, Math.sqrt(1 - d)];
  }
  const [ax, ay] = p.a, [bx, by] = p.b;
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / len2));
  const cx = ax + vx * t, cy = ay + vy * t;
  const r = (p.w0 + (p.w1 - p.w0) * t) / 2;
  const dx = x - cx, dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d > r) return null;
  const s = d / Math.max(0.01, r);
  return [(dx / (d || 1)) * s, (dy / (d || 1)) * s, Math.sqrt(Math.max(0, 1 - s * s))];
}

function line(pts: Vec[], plot: (x: number, y: number) => void): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    let [x0, y0] = pts[i]!.map(Math.round) as Vec;
    const [x1, y1] = pts[i + 1]!.map(Math.round) as Vec;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      plot(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
}

/** Render a sculpture into a size×size canvas. Shapes are given in a 48-unit space and scaled to `size`. */
export function render(sc: Sculpture, size: number, unit = 48): HTMLCanvasElement {
  const k = size / unit;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const N = size * size;
  const part = new Int16Array(N).fill(-1);
  const shade = new Uint8Array(N);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / k, py = (y + 0.5) / k;
      for (let i = sc.prims.length - 1; i >= 0; i--) {
        const p = sc.prims[i]!;
        const n = hit(p, px, py);
        if (!n) continue;
        part[y * size + x] = i;
        if (p.flat !== undefined) shade[y * size + x] = p.flat;
        else {
          const l = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
          shade[y * size + x] = l > 0.9 && p.shine !== false ? 4 : l > 0.62 ? 3 : l > 0.22 ? 2 : 1;
        }
        break;
      }
    }
  }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= size || y >= size ? -1 : part[y * size + x]!);
  // Pixels go straight into an ImageData (one fillRect per pixel was the slow part of building a card).
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const put = (x: number, y: number, col: string, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const [r, g, b] = rgbOf(col);
    const o = (y * size + x) * 4;
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a;
  };

  // Ground shadow first, dithered so it stays pixel art.
  if (sc.shadow) {
    const [cx, cy, rx] = sc.shadow.map((v) => v * k) as [number, number, number];
    const ry = Math.max(1.5, rx * 0.28);
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
        if (d <= 1 && (d < 0.55 || (x + y) % 2 === 0)) put(x, y, "#0a0810", 115);
      }
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = at(x, y);
      if (i < 0) {
        // 1px outline around the silhouette, "selective": on the lit top-left it's the darkest step of the
        // neighbour's own ramp, on the shadowed bottom-right it's near-black ink. Shapes read as solid and lit.
        const right = at(x + 1, y), below = at(x, y + 1), left = at(x - 1, y), above = at(x, y - 1);
        const n = [right, below, left, above].find((v) => v >= 0);
        if (n === undefined) continue;
        const shadowSide = (left >= 0 || above >= 0) && right < 0 && below < 0;
        put(x, y, shadowSide ? PAL.ink : RAMPS[sc.prims[n]!.mat][0]);
        continue;
      }
      const p = sc.prims[i]!;
      const ramp = RAMPS[p.mat];
      let s = shade[y * size + x]!;
      // Where this part overlaps a part behind it, draw a separation line in its own darker tone.
      if (p.edge !== false) {
        const nb = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
        const behind = nb.find((v) => v >= 0 && v < i && sc.prims[v]!.mat !== p.mat);
        const below = at(x, y + 1);
        if (behind !== undefined) s = 0;
        else if (below >= 0 && below < i && sc.prims[below]!.mat === p.mat) s = Math.min(s, 1);
      }
      // Form shadow: the body's own bottom-right rim steps one shade darker, so rounded parts look rounded.
      if (s > 1 && (at(x + 1, y) < 0 && at(x, y + 1) < 0)) s -= 1;
      put(x, y, ramp[s]!);
    }
  }

  for (const st of sc.strokes ?? []) {
    line(st.pts.map(([x, y]) => [x * k, y * k] as Vec), (x, y) => { if (!st.onlyOnBody || at(x, y) >= 0) put(x, y, st.color); });
  }
  for (const e of sc.eyes ?? []) {
    const ex = Math.round(e.x * k), ey = Math.round(e.y * k), s = Math.max(1, Math.round(e.s * k));
    if (e.glow) {
      for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) put(ex + i, ey + j, e.glow);
      put(ex + (e.look === -1 ? 0 : s - 1), ey, PAL.white);
      continue;
    }
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) put(ex + i, ey + j, PAL.white);
    // Pupil toward where it looks; a glint stays white.
    const px = e.look === -1 ? ex : ex + Math.max(0, s - Math.ceil(s / 2));
    for (let j = s > 2 ? 1 : 0; j < s; j++) for (let i = 0; i < Math.ceil(s / 2); i++) put(px + i, ey + j, PAL.ink);
  }
  for (const [x, y, col] of sc.pixels ?? []) put(Math.round(x * k), Math.round(y * k), col);
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * A pose of a sculpture, for animation frames: everything above the feet sinks by `breathe` (a breath), the
 * tallest parts (ears, flames, leaves, crests) sway by `sway`, and the whole body leans by `lean` (forward is +x,
 * the way art faces). Feet stay planted. Things with no feet on the ground (fish, floaters) bob as a whole.
 */
export interface Pose { breathe?: number; sway?: number; lean?: number }

export function posed(sc: Sculpture, pose: Pose): Sculpture {
  const b = pose.breathe ?? 0, sw = pose.sway ?? 0, ln = pose.lean ?? 0;
  if (!b && !sw && !ln) return sc;
  const bottom = Math.max(...sc.prims.map((p) => (p.k === "ell" ? p.cy + p.ry : p.k === "poly" ? Math.max(...p.pts.map((q) => q[1])) : Math.max(p.a[1], p.b[1]) + p.w0 / 2)));
  const grounded = bottom >= 40;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const mv = ([x, y]: Vec): Vec => {
    const w = grounded ? clamp((41 - y) / 9) : 1;
    const tip = clamp((24 - y) / 12);
    const lean = ln * clamp((44 - y) / 30);
    return [x + lean + sw * tip, y + b * w];
  };
  const prims = sc.prims.map((p): Prim => {
    if (p.k === "ell") { const [cx, cy] = mv([p.cx, p.cy]); return { ...p, cx, cy }; }
    if (p.k === "poly") return { ...p, pts: p.pts.map(mv) };
    return { ...p, a: mv(p.a), b: mv(p.b) };
  });
  return {
    ...sc,
    prims,
    eyes: sc.eyes?.map((e) => { const [x, y] = mv([e.x, e.y]); return { ...e, x, y }; }),
    strokes: sc.strokes?.map((s) => ({ ...s, pts: s.pts.map(mv) })),
    pixels: sc.pixels?.map(([x, y, c]) => { const [nx, ny] = mv([x, y]); return [nx, ny, c] as [number, number, string]; }),
    shadow: sc.shadow ? [sc.shadow[0] + ln * 0.3, sc.shadow[1], sc.shadow[2]] : undefined,
  };
}

/** The named poses the board uses: a 4-frame idle loop, an attack lunge and a hit recoil. */
export const POSES: Record<string, Pose> = {
  idle0: {},
  idle1: { breathe: 0.6, sway: 0.5 },
  idle2: { breathe: 1.2, sway: 1 },
  idle3: { breathe: 0.6, sway: 0.4 },
  attack: { lean: 4, breathe: -1, sway: 1.5 },
  hit: { lean: -3, breathe: 1, sway: -1 },
};
