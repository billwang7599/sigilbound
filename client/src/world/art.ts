/**
 * The overworld's art, drawn in code: a cute SNES/GBA-era JRPG town (think Pokémon gen 3–5 towns, Secret of Mana,
 * Mother 3), not the duel board's dark parchment look.
 *
 * - One bright, limited palette of its own (WORLD below): every material is a short ramp
 *   outline · dark · base · light (· shine), and nothing on the map uses a colour outside a ramp.
 * - Cel shading: a few flat tones per shape with hard edges, light from the top left. No dithered gradients.
 * - Coloured outlines: each shape is ringed in the darkest tone of its own ramp (never black), and its top edge
 *   only gets the softer dark tone, so things read as lit from above.
 * - Ground shadows are hard-edged, one flat tone, and all fall the same way (down and right). The standing props'
 *   shadows are baked into the ground canvas through one mask, so two shadows that overlap don't double up.
 * - Life without shaders: the water has a few frames of pixel-stepped ripples, and trees have a second frame with
 *   the top of the crown nudged one pixel (the scene flips between them for a slow wind).
 *
 * Pure canvas, no Pixi.
 */
import { Px } from "../gfx/frames.js";
import { TILE, groundAt, type Ground, type Prop, type WorldMap } from "../core/world.js";

// ---- palette ----

/** A material: outline, dark, base, light, shine. */
type Ramp = readonly [string, string, string, string, string];

export const WORLD = {
  grass: ["#2f6f3e", "#4c9a4a", "#6cbf58", "#8fd46a", "#c2ea8a"],
  leaf: ["#1d4d33", "#2e7a40", "#47a34c", "#6fc457", "#a8e070"],
  pine: ["#173f33", "#24644a", "#338459", "#4fa86a", "#86c98a"],
  bark: ["#4a2a1c", "#6e4128", "#93603a", "#b88150", "#d6a46c"],
  dirt: ["#9a6a3e", "#c08a52", "#dcae72", "#ecca92", "#f6e0b4"],
  sand: ["#b48c55", "#d9b778", "#f0d79c", "#fbebc0", "#fff7e0"],
  cobble: ["#7d6a5a", "#a8957f", "#cfbfa6", "#e6dac4", "#f6efe0"],
  water: ["#235a9e", "#2d6fc4", "#4a9be6", "#7cc6f2", "#d6f3ff"],
  wall: ["#7a5238", "#d4b98c", "#efdcb4", "#fff3d8", "#fffaf0"],
  roofRed: ["#6e1c2a", "#a62c39", "#d9474a", "#f07a62", "#ffb08a"],
  roofBlue: ["#1d3570", "#2f55a3", "#4579cf", "#6fa3ea", "#a8cdf7"],
  wood: ["#5a3420", "#8a5532", "#b57a45", "#d9a066", "#f0c890"],
  stone: ["#4f4a58", "#8c8794", "#b3afba", "#d6d3dc", "#f0eef4"],
  iron: ["#262a36", "#3d4352", "#596173", "#8189a0", "#b7bfd2"],
  glass: ["#2b4f86", "#4a7fc4", "#7fb2ea", "#bfe0fa", "#f2fbff"],
  awnRed: ["#6e1c2a", "#b8323c", "#e8505a", "#f6857e", "#ffc0b0"],
  awnBlue: ["#1d3570", "#3463b4", "#4f8ae0", "#80b6f2", "#c4e0ff"],
  cloth: ["#7a6a5a", "#d8d0c4", "#f4efe6", "#ffffff", "#ffffff"],
  gold: ["#7a4f14", "#c48a22", "#f2c24e", "#ffe28a", "#fff6cc"],
} as const satisfies Record<string, Ramp>;

const FLOWERS = [
  { petal: "#e8434f", eye: "#ffe28a" },
  { petal: "#fbf7f0", eye: "#f2c24e" },
  { petal: "#ffd84a", eye: "#e07a2c" },
  { petal: "#f59ac0", eye: "#fff6cc" },
  { petal: "#7fa6f5", eye: "#fbf7f0" },
] as const;

/** Every colour → the ramp it belongs to, so outlines can pick the right shade for whatever they ring. */
const RAMP_OF = new Map<string, Ramp>();
for (const r of Object.values(WORLD)) for (const c of r) if (!RAMP_OF.has(c)) RAMP_OF.set(c, r);
for (const f of FLOWERS) { RAMP_OF.set(f.petal, WORLD.leaf); RAMP_OF.set(f.eye, WORLD.leaf); }

/** Ground shadow: the colour under it, multiplied by a cool tone (hard edge, one flat step). */
const SHADE: [number, number, number] = [0.7, 0.76, 0.88];

// ---- a tiny pixel grid ----

class G {
  readonly d: (string | null)[];
  constructor(readonly w: number, readonly h: number) { this.d = new Array<string | null>(w * h).fill(null); }
  in(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x: number, y: number): string | null { return this.in(x, y) ? this.d[y * this.w + x]! : null; }
  set(x: number, y: number, c: string): this { if (this.in(x, y)) this.d[y * this.w + x] = c; return this; }
  rect(x: number, y: number, w: number, h: number, c: string): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  }
  /**
   * Ring every filled shape with its own ramp's outline. An empty pixel sitting on top of a shape (the shape's top
   * edge) gets the softer dark tone instead, so the light seems to come from above.
   */
  outline(): this {
    const filled = this.d.map((c) => c !== null);
    const at = (x: number, y: number) => this.in(x, y) && filled[y * this.w + x]!;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (filled[y * this.w + x]) continue;
      const n = at(x - 1, y) ? this.d[y * this.w + x - 1] : at(x + 1, y) ? this.d[y * this.w + x + 1] : at(x, y - 1) ? this.d[(y - 1) * this.w + x] : null;
      if (n) { this.set(x, y, (RAMP_OF.get(n) ?? WORLD.stone)[0]); continue; }
      if (at(x, y + 1)) this.set(x, y, (RAMP_OF.get(this.d[(y + 1) * this.w + x]!) ?? WORLD.stone)[1]);
    }
    return this;
  }
  canvas(): HTMLCanvasElement {
    const p = new Px(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const c = this.d[y * this.w + x]; if (c) p.px(x, y, c); }
    return p.c;
  }
}

/**
 * One round cel-shaded puff (foliage, a rock, a bush): light top-left, a shine spot, dark bottom-right. Drawn back
 * to front, a front puff's lit side lands on the back one's dark side, which is what makes a crown read as clumps.
 */
function puff(g: G, cx: number, cy: number, rx: number, ry: number, r: Ramp, shine = true): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
      if (d > 1) continue;
      const lit = -(dx * 0.6 + dy * 0.8);
      const c = shine && lit > 0.62 && d < 0.5 ? r[4] : lit > 0.3 ? r[3] : lit > -0.4 ? r[2] : r[1];
      g.set(x, y, c);
    }
  }
}

function ellipseMask(cx: number, cy: number, rx: number, ry: number, put: (x: number, y: number) => void): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) put(x, y);
    }
  }
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

const hexCache = new Map<string, string>();
function shade(col: string): string {
  let out = hexCache.get(col);
  if (!out) {
    const n = parseInt(col.slice(1, 7), 16);
    const ch = (v: number, k: number) => Math.round(v * k).toString(16).padStart(2, "0");
    out = `#${ch((n >> 16) & 255, SHADE[0])}${ch((n >> 8) & 255, SHADE[1])}${ch(n & 255, SHADE[2])}`;
    hexCache.set(col, out);
  }
  return out;
}

// ---- the ground ----

/** How many frames the water's ripples loop through. */
export const WATER_FRAMES = 3;

const groundCache = new WeakMap<WorldMap, Map<number, HTMLCanvasElement>>();

/**
 * The whole map's ground, one pixel per world pixel, with the props' ground shadows baked in. `frame` picks the
 * water's ripple frame (0 … WATER_FRAMES-1); everything else is the same in every frame.
 */
export function groundCanvas(m: WorldMap, frame = 0): HTMLCanvasElement {
  let frames = groundCache.get(m);
  if (!frames) { frames = new Map(); groundCache.set(m, frames); }
  const hit = frames.get(frame);
  if (hit) return hit;
  const W = m.w * TILE, H = m.h * TILE;
  const g = new G(W, H);
  const at = (tx: number, ty: number): Ground | null => groundAt(m, tx, ty);
  const gr = WORLD.grass;

  for (let ty = 0; ty < m.h; ty++) {
    for (let tx = 0; tx < m.w; tx++) {
      const kind = at(tx, ty)!;
      const x0 = tx * TILE, y0 = ty * TILE;
      const rand = seeded(tx * 9173 + ty * 131 + 7);
      g.rect(x0, y0, TILE, TILE, gr[2]);
      if (kind === "grass" || kind === "flowers") grassDetail(g, x0, y0, rand);
      if (kind === "flowers") flowerTile(g, x0, y0, rand);
      if (kind === "path" || kind === "sand") softTile(g, m, tx, ty, kind, rand);
      if (kind === "cobble") cobbleTile(g, m, tx, ty);
      if (kind === "water") waterTile(g, m, tx, ty, frame);
    }
  }

  // Shadows: one mask for every standing thing, then one flat shade, so overlaps don't stack.
  const mask = new Uint8Array(W * H);
  const put = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < W && y < H) mask[y * W + x] = 1; };
  for (const p of m.props) propShadow(p, put);
  for (let i = 0; i < mask.length; i++) if (mask[i] && g.d[i]) g.d[i] = shade(g.d[i]!);

  const c = g.canvas();
  frames.set(frame, c);
  return c;
}

/** Sparse JRPG grass: a few little tufts and light specks per tile, never noise. */
function grassDetail(g: G, x0: number, y0: number, rand: () => number): void {
  const gr = WORLD.grass;
  const r = rand();
  if (r < 0.42) {
    const x = x0 + 2 + Math.floor(rand() * 9), y = y0 + 3 + Math.floor(rand() * 10);
    // A "w" tuft: dark blades with a lit tip.
    g.set(x, y, gr[1]).set(x + 2, y, gr[1]).set(x + 4, y, gr[1]).set(x + 1, y + 1, gr[1]).set(x + 3, y + 1, gr[1]);
    g.set(x, y - 1, gr[3]).set(x + 4, y - 1, gr[3]);
  }
  if (r > 0.3 && r < 0.62) {
    const x = x0 + 1 + Math.floor(rand() * 13), y = y0 + 1 + Math.floor(rand() * 13);
    g.set(x, y, gr[3]).set(x + 1, y, gr[3]);
  }
  if (r > 0.88) {
    const x = x0 + 3 + Math.floor(rand() * 9), y = y0 + 3 + Math.floor(rand() * 9);
    g.set(x, y, gr[4]);
  }
}

function flowerTile(g: G, x0: number, y0: number, rand: () => number): void {
  const spots: [number, number][] = [[3, 3], [10, 5], [5, 10], [12, 12]];
  for (const [sx, sy] of spots) {
    if (rand() < 0.2) continue;
    const f = FLOWERS[Math.floor(rand() * FLOWERS.length)]!;
    const x = x0 + sx, y = y0 + sy;
    g.set(x, y + 2, WORLD.grass[1]).set(x + 1, y + 2, WORLD.grass[1]);
    g.set(x - 1, y, f.petal).set(x + 1, y, f.petal).set(x, y - 1, f.petal).set(x, y + 1, f.petal).set(x, y, f.eye);
  }
}

/** Dirt paths and sand: rounded, slightly wobbly edges with a 1px darker rim, a few pebbles. */
function softTile(g: G, m: WorldMap, tx: number, ty: number, kind: "path" | "sand", rand: () => number): void {
  const r = kind === "path" ? WORLD.dirt : WORLD.sand;
  const same = (dx: number, dy: number) => {
    const o = groundAt(m, tx + dx, ty + dy);
    if (o === null) return true;
    if (kind === "sand") return o === "sand" || o === "water";
    return o === "path" || o === "cobble";
  };
  const x0 = tx * TILE, y0 = ty * TILE, last = TILE - 1;
  const up = same(0, -1), dn = same(0, 1), lf = same(-1, 0), rt = same(1, 0);
  for (let ly = 0; ly < TILE; ly++) {
    for (let lx = 0; lx < TILE; lx++) {
      let edge = 9;
      if (!up) edge = Math.min(edge, ly);
      if (!dn) edge = Math.min(edge, last - ly);
      if (!lf) edge = Math.min(edge, lx);
      if (!rt) edge = Math.min(edge, last - lx);
      // Rounded outer corners (radius ~3), and inner corners where two neighbours join but the diagonal doesn't.
      const corner = (a: boolean, b: boolean, u: number, v: number) => !a && !b && (u - 3.5) ** 2 + (v - 3.5) ** 2 > 12.25 && u < 3.5 && v < 3.5;
      if (corner(lf, up, lx, ly) || corner(rt, up, last - lx, ly) || corner(lf, dn, lx, last - ly) || corner(rt, dn, last - lx, last - ly)) continue;
      const x = x0 + lx, y = y0 + ly;
      // A gentle wobble along straight edges (every few pixels the grass reaches in one).
      const wob = hash2(Math.floor(x / 3), Math.floor(y / 3)) > 0.72 ? 1 : 0;
      if (edge < wob) continue;
      g.set(x, y, edge <= wob ? r[1] : r[2]);
    }
  }
  // Specks and pebbles, away from the rim.
  for (let i = 0; i < 3; i++) {
    const x = x0 + 3 + Math.floor(rand() * 10), y = y0 + 3 + Math.floor(rand() * 10);
    const k = rand();
    if (k < 0.45) g.set(x, y, r[3]).set(x + 1, y, r[3]);
    else if (k < 0.7) g.set(x, y, r[1]);
    else if (kind === "path") g.set(x, y, WORLD.cobble[3]).set(x + 1, y, WORLD.cobble[2]).set(x, y + 1, WORLD.cobble[1]).set(x + 1, y + 1, WORLD.cobble[1]);
  }
}

/** The plaza: rounded paving stones in offset rows, light top-left, grout between. */
function cobbleTile(g: G, m: WorldMap, tx: number, ty: number): void {
  const r = WORLD.cobble, x0 = tx * TILE, y0 = ty * TILE;
  g.rect(x0, y0, TILE, TILE, r[1]);
  for (let row = 0; row < 2; row++) {
    const off = (ty * 2 + row) % 2 ? 4 : 0;
    for (let col = -1; col < 2; col++) {
      const sx = x0 + col * 8 + off, sy = y0 + row * 8;
      for (let j = 1; j < 7; j++) for (let i = 1; i < 7; i++) {
        const x = sx + i, y = sy + j;
        if (x < x0 || x >= x0 + TILE) continue;
        if ((i === 1 || i === 6) && (j === 1 || j === 6)) continue; // rounded corners
        g.set(x, y, j === 1 || i === 1 ? r[3] : j === 6 || i === 6 ? r[1] : r[2]);
      }
      if (sx + 2 >= x0 && sx + 2 < x0 + TILE && hash2(sx, sy) > 0.6) g.set(sx + 2, sy + 2, r[4]);
    }
  }
  // Where the plaza meets grass, a clean dark kerb.
  const edge = (dx: number, dy: number) => { const o = groundAt(m, tx + dx, ty + dy); return o !== null && o !== "cobble" && o !== "path"; };
  if (edge(0, -1)) g.rect(x0, y0, TILE, 1, r[0]);
  if (edge(0, 1)) g.rect(x0, y0 + TILE - 1, TILE, 1, r[0]);
  if (edge(-1, 0)) g.rect(x0, y0, 1, TILE, r[0]);
  if (edge(1, 0)) g.rect(x0 + TILE - 1, y0, 1, TILE, r[0]);
}

/** Water: flat blue, a shaded band under the bank, a light lip at the shore, ripples that step between frames. */
function waterTile(g: G, m: WorldMap, tx: number, ty: number, frame: number): void {
  const r = WORLD.water, x0 = tx * TILE, y0 = ty * TILE;
  const water = (dx: number, dy: number) => groundAt(m, tx + dx, ty + dy) === "water";
  g.rect(x0, y0, TILE, TILE, r[2]);
  const up = water(0, -1), dn = water(0, 1), lf = water(-1, 0), rt = water(1, 0);
  if (!up) { g.rect(x0, y0, TILE, 3, r[1]); g.rect(x0, y0, TILE, 1, r[0]); }
  if (!lf) { g.rect(x0, y0, 2, TILE, r[1]); g.rect(x0, y0, 1, TILE, r[0]); }
  if (!rt) g.rect(x0 + TILE - 1, y0, 1, TILE, r[3]);
  if (!dn) { g.rect(x0, y0 + TILE - 2, TILE, 1, r[3]); g.rect(x0, y0 + TILE - 1, TILE, 1, r[4]); }
  // Round the pond's outer corners back into the grass, with the bank's outline following the curve.
  const round = (open: boolean, sx: number, sy: number, rim: string) => {
    if (!open) return;
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
      const d = (i - 4.5) ** 2 + (j - 4.5) ** 2;
      const x = x0 + (sx > 0 ? TILE - 1 - i : i), y = y0 + (sy > 0 ? TILE - 1 - j : j);
      if (d > 20.25) g.set(x, y, WORLD.grass[2]);
      else if (d > 12.25) g.set(x, y, rim);
    }
  };
  round(!up && !lf, 0, 0, r[0]); round(!up && !rt, 1, 0, r[0]); round(!dn && !lf, 0, 1, r[4]); round(!dn && !rt, 1, 1, r[4]);
  // Two ripples per tile, sliding a pixel per frame and blinking out on one frame each.
  const rand = seeded(tx * 31 + ty * 977);
  for (let i = 0; i < 2; i++) {
    const rx = 3 + Math.floor(rand() * 7), ry = 5 + Math.floor(rand() * 7);
    if ((frame + i) % WATER_FRAMES === 2) continue;
    const x = x0 + rx + ((frame + i) % WATER_FRAMES), y = y0 + ry;
    g.rect(x, y, 3, 1, r[3]).set(x + 1, y - 1, r[4]);
  }
  if (rand() < 0.3) {
    const lx = x0 + 5 + Math.floor(rand() * 6), ly = y0 + 6 + Math.floor(rand() * 5);
    const l = WORLD.leaf;
    g.rect(lx - 2, ly, 5, 2, l[2]).rect(lx - 1, ly - 1, 3, 1, l[3]).set(lx, ly, r[2]).rect(lx - 2, ly + 2, 5, 1, l[1]);
    if (hash2(tx, ty) > 0.5) g.set(lx + 1, ly - 1, FLOWERS[3].petal);
  }
}

/** Where each standing thing throws its shadow (world pixels): all down and to the right, hard-edged. */
function propShadow(p: Prop, put: (x: number, y: number) => void): void {
  const left = p.x * TILE, top = p.y * TILE, right = (p.x + p.w) * TILE, bottom = (p.y + p.h) * TILE;
  const cx = (left + right) / 2;
  const box = (x: number, y: number, w: number, h: number) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j); };
  switch (p.kind) {
    case "tree": ellipseMask(cx + 4, bottom - 2, 12, 5, put); break;
    case "pine": ellipseMask(cx + 3, bottom - 2, 9, 4, put); break;
    case "bush": ellipseMask(cx + 2, bottom - 2, 7, 3, put); break;
    case "rock": ellipseMask(cx + 2, bottom - 3, 7, 3, put); break;
    case "fence": box(left + 2, bottom - 2, TILE, 3); break;
    case "house":
      box(right, top + 30, 7, bottom - top - 28);
      box(left + 6, bottom, right - left + 1, 4);
      break;
    case "stall": box(right, top + 6, 4, bottom - top - 4); box(left + 4, bottom, right - left, 3); break;
    case "well": ellipseMask(cx + 4, bottom - 5, 19, 7, put); break;
    case "lamp": ellipseMask(cx + 3, bottom - 2, 5, 2, put); break;
    case "sign": ellipseMask(cx + 3, bottom - 2, 6, 2, put); break;
  }
}

// ---- standing things ----

/**
 * A prop's art and where it sits: the canvas's top-left relative to the footprint's top-left (world pixels).
 * `sway`, when present, is a second frame for the wind (the top rows nudged one pixel).
 */
export interface PropArt { canvas: HTMLCanvasElement; dx: number; dy: number; /** y that sorts it against walkers. */ sortY: number; sway?: HTMLCanvasElement }

const cache = new Map<string, HTMLCanvasElement>();
const cached = (key: string, make: () => HTMLCanvasElement) => {
  let c = cache.get(key);
  if (!c) { c = make(); cache.set(key, c); }
  return c;
};

/** The same grid with every row above `rows` shifted one pixel right: the wind frame. */
function swayed(g: G, rows: number): G {
  const s = new G(g.w, g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const c = g.get(y < rows ? x - 1 : x, y);
    if (c) s.set(x, y, c);
  }
  return s;
}

/** A round, fluffy broadleaf tree: 34×42, a short trunk under a crown of cel-shaded clumps. */
function treeGrid(v: number): G {
  const g = new G(34, 42);
  const L = WORLD.leaf, B = WORLD.bark;
  const s = v % 3;
  // Trunk with a root flare, lit on the left.
  g.rect(14, 28, 6, 12, B[2]).rect(14, 28, 2, 12, B[3]).rect(18, 28, 2, 12, B[1]);
  g.rect(12, 38, 10, 2, B[2]).rect(12, 38, 2, 2, B[3]).rect(20, 38, 2, 2, B[1]);
  // Crown, back to front.
  puff(g, 17, 12, 10, 9, L);
  puff(g, 9, 17, 7, 6.5, L);
  puff(g, 25, 17, 7, 6.5, L);
  puff(g, 13, 9, 6, 5.5, L);
  puff(g, 22, 10, 6, 5.5, L);
  puff(g, 17, 22, 9, 6.5, L);
  puff(g, 10, 23, 6, 5, L);
  puff(g, 24, 23, 6, 5, L);
  // Variant touches: red fruit, or white blossoms.
  if (s === 1) for (const [x, y] of [[10, 16], [22, 13], [17, 21], [25, 21]] as const) g.set(x, y, "#e8434f").set(x, y + 1, WORLD.roofRed[1]);
  if (s === 2) for (const [x, y] of [[12, 12], [21, 18], [8, 21], [19, 8], [26, 16]] as const) g.set(x, y, "#fbf7f0");
  return g.outline();
}

/** A rounded pine: 32×46, three scalloped tiers, lit on the left. */
function pineGrid(v: number): G {
  const g = new G(32, 46);
  const P = WORLD.pine, B = WORLD.bark;
  const tall = v % 2;
  g.rect(14, 36, 4, 8, B[2]).rect(14, 36, 1, 8, B[3]).rect(17, 36, 1, 8, B[1]);
  const tier = (top: number, base: number, half: number) => {
    for (let y = top; y <= base; y++) {
      const t = (y - top) / (base - top);
      const w = Math.max(1, Math.round(1.5 + t * half));
      for (let x = 16 - w; x < 16 + w; x++) {
        const rel = (x + 0.5 - 16) / w;
        const scallop = y >= base - 1 && Math.abs(((x - (16 - w)) % 5) - 2) > 1 && y === base;
        if (scallop) continue;
        const c = y >= base - 1 ? P[1] : rel < -0.35 ? P[3] : rel > 0.4 ? P[1] : P[2];
        g.set(x, y, c);
      }
    }
  };
  tier(18 - tall * 2, 38, 13);
  tier(9 - tall * 2, 28, 10.5);
  tier(1 - tall * 2 + 2, 19, 7.5);
  g.set(14, 7, P[4]).set(12, 16, P[4]).set(10, 26, P[4]);
  return g.outline();
}

function bushGrid(): G {
  const g = new G(18, 16);
  const L = WORLD.leaf;
  puff(g, 6, 9, 4.5, 4, L);
  puff(g, 12, 9, 4.5, 4, L);
  puff(g, 9, 10, 6.5, 4.5, L);
  for (const [x, y] of [[6, 8], [11, 7], [9, 11], [13, 10]] as const) g.set(x, y, FLOWERS[3].petal);
  return g.outline();
}

function rockGrid(): G {
  const g = new G(18, 16);
  const S = WORLD.stone;
  puff(g, 9, 10, 7, 4.5, S);
  puff(g, 6, 9, 4, 3.5, S);
  g.set(10, 9, S[1]).set(11, 9, S[1]).set(11, 10, S[1]);
  g.set(5, 13, WORLD.grass[3]).set(13, 13, WORLD.grass[3]);
  return g.outline();
}

/** A wooden fence segment: rounded posts, two rails joining whichever neighbours are fence too. 18×22. */
function fenceCanvas(l: boolean, r: boolean, u: boolean, d: boolean): HTMLCanvasElement {
  return cached(`fence${+l}${+r}${+u}${+d}`, () => {
    const g = new G(18, 22);
    const W = WORLD.wood;
    const rail = (y: number, x0: number, x1: number) => { g.rect(x0, y, x1 - x0, 1, W[3]).rect(x0, y + 1, x1 - x0, 1, W[2]); };
    const vert = u || d;
    if (l || r || !vert) { rail(8, l ? 0 : 7, r ? 18 : 11); rail(14, l ? 0 : 7, r ? 18 : 11); }
    if (vert) {
      const top = u ? 0 : 6, bot = d ? 22 : 19;
      g.rect(8, top, 2, bot - top, W[2]).rect(8, top, 1, bot - top, W[3]);
    }
    // The post: rounded cap, lit left side.
    g.rect(7, 4, 4, 15, W[2]).rect(7, 4, 1, 15, W[3]).rect(10, 4, 1, 15, W[1]).rect(8, 3, 2, 1, W[4]);
    return g.outline().canvas();
  });
}

const HOUSE_ROOFS = [WORLD.roofRed, WORLD.roofBlue] as const;

/**
 * A cottage on a 4×3 footprint: 66×84. A big tiled roof with a ridge cap and a clear eave overhang, cream walls
 * under a shaded band, two glass windows with flower boxes, a round-topped door, a stone foundation and a chimney.
 */
function houseCanvas(v: number): HTMLCanvasElement {
  return cached(`house${v}`, () => {
    const Wd = 66, H = 84;
    const g = new G(Wd, H);
    const R = HOUSE_ROOFS[v % HOUSE_ROOFS.length]!, Wl = WORLD.wall, Wo = WORLD.wood, S = WORLD.stone, Gl = WORLD.glass;
    const wallTop = 46, base = H - 2;
    // Walls: lit left edge, shaded right edge, a dark band under the eave.
    g.rect(4, wallTop, Wd - 8, base - wallTop, Wl[2]);
    g.rect(4, wallTop, 2, base - wallTop, Wl[3]).rect(Wd - 6, wallTop, 2, base - wallTop, Wl[1]);
    g.rect(4, wallTop, Wd - 8, 4, Wl[1]);
    // Corner beams.
    for (const x of [4, Wd - 7]) g.rect(x, wallTop, 3, base - wallTop, Wo[2]).rect(x, wallTop, 1, base - wallTop, Wo[3]);
    // Stone foundation.
    g.rect(4, base - 4, Wd - 8, 4, S[2]);
    for (let x = 4; x < Wd - 4; x += 6) g.rect(x, base - 4, 5, 1, S[3]).rect(x + 5, base - 4, 1, 4, S[1]);
    // Door: round top, two panels, a gold knob, a step.
    const dx = 27, dw = 12, dy = base - 21;
    g.rect(dx, dy + 2, dw, 21 - 2, Wo[2]).rect(dx + 2, dy, dw - 4, 2, Wo[2]).rect(dx + 1, dy + 1, dw - 2, 1, Wo[2]);
    g.rect(dx, dy + 2, 1, 19, Wo[3]).rect(dx + 2, dy + 4, 3, 7, Wo[1]).rect(dx + 7, dy + 4, 3, 7, Wo[1]).rect(dx + 2, dy + 13, 3, 6, Wo[1]).rect(dx + 7, dy + 13, 3, 6, Wo[1]);
    g.rect(dx + 9, dy + 11, 2, 2, WORLD.gold[2]);
    // Door outline (it sits inside the wall, so ring it by hand).
    g.rect(dx - 1, dy + 2, 1, 19, Wo[0]).rect(dx + dw, dy + 2, 1, 19, Wo[0]).rect(dx + 1, dy, 1, 1, Wo[0]).rect(dx + dw - 2, dy, 1, 1, Wo[0]).rect(dx + 2, dy - 1, dw - 4, 1, Wo[0]).set(dx, dy + 1, Wo[0]).set(dx + dw - 1, dy + 1, Wo[0]);
    g.rect(dx - 2, base, dw + 4, 2, S[3]).rect(dx - 2, base + 1, dw + 4, 1, S[1]);
    // Windows: blue glass with a diagonal shine, a cross frame, a flower box.
    for (const wx of [11, 43]) {
      const wy = wallTop + 9;
      g.rect(wx - 1, wy - 1, 14, 12, Wo[0]);
      g.rect(wx, wy, 12, 10, Gl[2]).rect(wx, wy, 12, 2, Gl[1]);
      for (let i = 0; i < 4; i++) g.set(wx + 2 + i, wy + 6 - i, Gl[4]).set(wx + 3 + i, wy + 6 - i, Gl[3]);
      g.rect(wx + 5, wy, 2, 10, Wo[2]).rect(wx, wy + 4, 12, 2, Wo[2]);
      g.rect(wx - 2, wy + 11, 16, 3, Wo[2]).rect(wx - 2, wy + 11, 16, 1, Wo[3]).rect(wx - 2, wy + 14, 16, 1, Wo[0]);
      for (let i = 0; i < 5; i++) {
        const f = FLOWERS[(i + v) % 4]!;
        g.set(wx - 1 + i * 3, wy + 10, f.petal).set(wx + i * 3, wy + 10, WORLD.leaf[2]);
      }
    }
    // Roof: a trapezoid from a narrow ridge out past the walls, tiles in offset rows, lit on the left.
    const ridge = 4, eave = wallTop + 3;
    for (let y = ridge; y < eave; y++) {
      const t = (y - ridge) / (eave - ridge);
      const half = 17 + t * 15;
      const x0 = Math.round(Wd / 2 - half), x1 = Math.round(Wd / 2 + half);
      const row = Math.floor((y - ridge) / 5), inRow = (y - ridge) % 5;
      for (let x = Math.max(1, x0); x < Math.min(Wd - 1, x1); x++) {
        const seam = (x + (row % 2) * 4) % 8 === 0 && inRow < 4;
        const side = (x - x0) / (x1 - x0);
        let c: string = side < 0.3 ? R[3] : side > 0.75 ? R[1] : R[2];
        if (inRow === 4) c = R[1];
        else if (inRow === 0 && side < 0.75) c = side < 0.3 ? R[4] : R[3];
        if (seam) c = R[1];
        g.set(x, y, c);
      }
    }
    // Ridge cap and the eave's lit fascia.
    g.rect(Wd / 2 - 17, ridge - 2, 34, 2, R[3]).rect(Wd / 2 - 17, ridge - 2, 34, 1, R[4]);
    g.rect(1, eave, Wd - 2, 2, R[3]).rect(1, eave + 1, Wd - 2, 1, R[2]);
    // Chimney (stone, behind the ridge line).
    g.rect(46, 8, 7, 12, S[2]).rect(46, 8, 2, 12, S[3]).rect(52, 8, 1, 12, S[1]).rect(45, 6, 9, 2, S[3]);
    g.outline();
    // Eave underside: a crisp dark line where the roof overhangs the wall.
    g.rect(2, eave + 2, Wd - 4, 1, R[0]);
    return g.canvas();
  });
}

const AWNINGS = [WORLD.awnRed, WORLD.awnBlue] as const;

/** A market stall on a 3×2 footprint: 50×48, a striped scalloped awning on posts over a counter of wares. */
function stallCanvas(v: number): HTMLCanvasElement {
  return cached(`stall${v}`, () => {
    const Wd = 50, H = 48;
    const g = new G(Wd, H);
    const A = AWNINGS[v % AWNINGS.length]!, C = WORLD.cloth, Wo = WORLD.wood;
    for (const x of [5, Wd - 8]) g.rect(x, 12, 3, H - 13, Wo[2]).rect(x, 12, 1, H - 13, Wo[3]);
    // Counter.
    const cy = H - 17;
    g.rect(2, cy, Wd - 4, 16, Wo[2]);
    for (let y = cy + 5; y < H - 1; y += 4) g.rect(3, y, Wd - 6, 1, Wo[1]);
    g.rect(2, cy, Wd - 4, 3, Wo[3]).rect(2, cy, Wd - 4, 1, Wo[4]).rect(2, cy + 3, Wd - 4, 1, Wo[1]);
    // Wares: round fruit (Ember stall) or fish and herbs (the blue one).
    const wares = v % 2 === 0
      ? [WORLD.roofRed, WORLD.gold, WORLD.roofRed, WORLD.gold, WORLD.roofRed]
      : [WORLD.water, WORLD.leaf, WORLD.water, WORLD.leaf, WORLD.water];
    wares.forEach((r, i) => puff(g, 10 + i * 7.5, cy - 2, 3, 2.5, r));
    // Awning: stripes, a lit top band, a scalloped hem.
    for (let y = 2; y < 14; y++) for (let x = 1; x < Wd - 1; x++) {
      const stripe = Math.floor((x - 1) / 6) % 2 === 0;
      const r = stripe ? A : C;
      g.set(x, y, y < 4 ? r[3] : y > 11 ? r[1] : r[2]);
    }
    for (let x = 1; x < Wd - 1; x++) {
      const k = (x - 1) % 6, drop = k > 0 && k < 5 ? 2 : 1;
      const r = Math.floor((x - 1) / 6) % 2 === 0 ? A : C;
      for (let y = 14; y < 14 + drop; y++) g.set(x, y, r[1]);
    }
    return g.outline().canvas();
  });
}

/** The plaza well on a 3×2 footprint: 50×46. A stone ring with water, posts and a little tiled roof, a bucket. */
function wellCanvas(): HTMLCanvasElement {
  return cached("well", () => {
    const Wd = 50, H = 46;
    const g = new G(Wd, H);
    const S = WORLD.stone, Wo = WORLD.wood, R = WORLD.roofRed, Wa = WORLD.water;
    // Ring: front face of stone blocks, a lit rim, water inside.
    ellipseMask(25, 33, 17, 9, (x, y) => g.set(x, y, S[2]));
    for (let y = 33; y < 43; y++) for (let x = 8; x < 42; x++) {
      if (!g.get(x, y)) continue;
      const row = Math.floor((y - 33) / 3);
      if ((y - 33) % 3 === 0 || (x + row * 3) % 7 === 0) g.set(x, y, S[1]);
    }
    ellipseMask(25, 31, 15, 6.5, (x, y) => g.set(x, y, S[3]));
    ellipseMask(25, 31, 11, 4.5, (x, y) => g.set(x, y, Wa[1]));
    ellipseMask(26, 32, 9, 3, (x, y) => g.set(x, y, Wa[2]));
    g.set(22, 31, Wa[4]).set(23, 31, Wa[3]);
    // Posts and the crossbar with a rope and bucket.
    for (const x of [10, 38]) g.rect(x, 12, 3, 20, Wo[2]).rect(x, 12, 1, 20, Wo[3]);
    g.rect(10, 17, 31, 2, Wo[3]).rect(10, 18, 31, 1, Wo[1]);
    g.rect(28, 19, 1, 5, Wo[1]);
    g.rect(26, 24, 5, 4, Wo[2]).rect(26, 24, 5, 1, WORLD.iron[3]).rect(26, 27, 5, 1, WORLD.iron[2]);
    // Roof.
    for (let y = 2; y < 14; y++) {
      const half = 6 + (y - 2) * 1.6;
      for (let x = Math.round(25 - half); x < Math.round(25 + half); x++) {
        const side = (x - (25 - half)) / (2 * half);
        g.set(x, y, (y - 2) % 4 === 3 ? R[1] : side < 0.3 ? R[3] : side > 0.72 ? R[1] : R[2]);
      }
    }
    g.rect(20, 1, 10, 1, R[4]);
    return g.outline().canvas();
  });
}

/** A lamp post: 16×36, a dark iron post and a glass lantern (lit only by day's light: no glow). */
function lampCanvas(): HTMLCanvasElement {
  return cached("lamp", () => {
    const g = new G(16, 36);
    const I = WORLD.iron, Gd = WORLD.gold;
    g.rect(7, 11, 2, 21, I[2]).rect(7, 11, 1, 21, I[3]);
    g.rect(5, 31, 6, 3, I[2]).rect(5, 31, 6, 1, I[3]);
    g.rect(4, 3, 8, 8, I[2]);
    g.rect(5, 4, 6, 6, Gd[3]).rect(5, 4, 2, 6, Gd[4]).rect(9, 4, 2, 6, Gd[2]);
    g.rect(7, 4, 2, 6, I[2]);
    g.rect(3, 2, 10, 1, I[3]).rect(5, 1, 6, 1, I[3]).rect(7, 0, 2, 1, I[2]);
    return g.outline().canvas();
  });
}

function signCanvas(): HTMLCanvasElement {
  return cached("sign", () => {
    const g = new G(18, 22);
    const Wo = WORLD.wood;
    g.rect(8, 11, 2, 10, Wo[2]).rect(8, 11, 1, 10, Wo[3]);
    g.rect(2, 3, 14, 8, Wo[3]).rect(2, 3, 14, 1, Wo[4]).rect(2, 10, 14, 1, Wo[1]);
    g.rect(4, 5, 9, 1, Wo[1]).rect(4, 7, 7, 1, Wo[1]);
    return g.outline().canvas();
  });
}

/** Rows (from the top) that move in the wind frame. */
const TREE_SWAY_ROWS = 11, PINE_SWAY_ROWS = 12;

/** The art for a prop, positioned against its footprint. `m` tells fences which neighbours to join. */
export function propArt(prop: Prop, m: WorldMap): PropArt {
  const bottom = (prop.y + prop.h) * TILE;
  const v = prop.v ?? ((prop.x * 7 + prop.y * 13) % 5);
  switch (prop.kind) {
    case "tree": {
      const k = v % 3;
      const g = (): G => treeGrid(k);
      const c = cached(`tree${k}`, () => g().canvas());
      const sway = cached(`tree${k}:sway`, () => swayed(g(), TREE_SWAY_ROWS).canvas());
      return { canvas: c, sway, dx: -9, dy: TILE - 41, sortY: bottom - 2 };
    }
    case "pine": {
      const k = v % 2;
      const c = cached(`pine${k}`, () => pineGrid(k).canvas());
      const sway = cached(`pine${k}:sway`, () => swayed(pineGrid(k), PINE_SWAY_ROWS).canvas());
      return { canvas: c, sway, dx: -8, dy: TILE - 45, sortY: bottom - 2 };
    }
    case "bush": return { canvas: cached("bush", () => bushGrid().canvas()), dx: -1, dy: 0, sortY: bottom - 2 };
    case "rock": return { canvas: cached("rock", () => rockGrid().canvas()), dx: -1, dy: 0, sortY: bottom - 2 };
    case "fence": {
      const isFence = (dx: number, dy: number) => m.props.some((q) => q.kind === "fence" && q.x === prop.x + dx && q.y === prop.y + dy);
      return { canvas: fenceCanvas(isFence(-1, 0), isFence(1, 0), isFence(0, -1), isFence(0, 1)), dx: -1, dy: -6, sortY: bottom - 3 };
    }
    case "house": { const c = houseCanvas(v); return { canvas: c, dx: -1, dy: prop.h * TILE - c.height + 2, sortY: bottom - 1 }; }
    case "stall": { const c = stallCanvas(v); return { canvas: c, dx: -1, dy: prop.h * TILE - c.height + 1, sortY: bottom - 1 }; }
    case "well": { const c = wellCanvas(); return { canvas: c, dx: -1, dy: prop.h * TILE - c.height + 2, sortY: bottom - 2 }; }
    case "lamp": { const c = lampCanvas(); return { canvas: c, dx: 0, dy: TILE - c.height, sortY: bottom - 2 }; }
    case "sign": { const c = signCanvas(); return { canvas: c, dx: -1, dy: TILE - c.height, sortY: bottom - 2 }; }
  }
}

/** A person's contact shadow: 12×4, one flat hard-edged tone. */
export function contactShadowCanvas(): HTMLCanvasElement {
  return cached("contact", () => {
    const p = new Px(12, 4);
    ellipseMask(6, 2, 6, 2, (x, y) => p.px(x, y, "#1d3a2c59"));
    return p.c;
  });
}

/** The "talk" bubble over an NPC you can talk to: 11×11, a speech balloon with "…". */
export function talkBubbleCanvas(): HTMLCanvasElement {
  return cached("bubble", () => {
    const ink = WORLD.iron[0], paper = "#fffaf0", paper2 = "#e8e0d0";
    const p = new Px(11, 11);
    p.rect(1, 0, 9, 1, ink).rect(0, 1, 1, 6, ink).rect(10, 1, 1, 6, ink).rect(1, 7, 9, 1, ink);
    p.rect(1, 1, 9, 6, paper).rect(1, 6, 9, 1, paper2);
    p.px(2, 4, ink).px(5, 4, ink).px(8, 4, ink);
    p.rect(4, 8, 3, 1, paper).px(3, 8, ink).px(7, 8, ink).rect(5, 9, 1, 1, paper).px(4, 9, ink).px(6, 9, ink).px(5, 10, ink);
    return p.c;
  });
}
