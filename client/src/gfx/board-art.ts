/**
 * The board's static art in one canvas: a plank table, a stitched felt playmat with three plain lanes, recessed
 * slots, a rope midline, velvet Sigil mats, leather pads for decks and discards, and slate plaques for LP.
 * Geometry comes from visuals/board.ts so the art always lines up with the hit areas.
 */
import { bayer, Px, type R } from "./frames.js";
import { PAL } from "./palette.js";

export interface BoardGeometry {
  w: number; h: number;
  field: R;
  lanes: R[];
  monsterSlots: R[];
  spellSlots: R[];
  sigilMats: R[];
  decks: R[];
  discards: R[];
  plaques: R[];
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

/** A stitched outline: 2 on, 2 off. */
function stitch(p: Px, r: R, col: string): void {
  for (let x = r.x; x < r.x + r.w; x++) if ((x - r.x) % 4 < 2) { p.px(x, r.y, col); p.px(x, r.y + r.h - 1, col); }
  for (let y = r.y; y < r.y + r.h; y++) if ((y - r.y) % 4 < 2) { p.px(r.x, y, col); p.px(r.x + r.w - 1, y, col); }
}

/** A recessed slot: dark rim on top/left, light lip on bottom/right, gold corner ticks. */
function slot(p: Px, r: R, base: string, dark: string, lip: string, tick: string): void {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (bayer(x, y) < 0.5) p.px(x, y, base);
  p.rect(r.x, r.y, r.w, 1, dark).rect(r.x, r.y, 1, r.h, dark);
  p.rect(r.x + 1, r.y + 1, r.w - 2, 1, base);
  p.rect(r.x, r.y + r.h - 1, r.w, 1, lip).rect(r.x + r.w - 1, r.y, 1, r.h, lip);
  const t = Math.min(4, Math.floor(Math.min(r.w, r.h) / 4));
  for (const [cx, cy, dx, dy] of [[r.x, r.y, 1, 1], [r.x + r.w - 1, r.y, -1, 1], [r.x, r.y + r.h - 1, 1, -1], [r.x + r.w - 1, r.y + r.h - 1, -1, -1]] as const) {
    for (let i = 0; i < t; i++) { p.px(cx + dx * i, cy, tick); p.px(cx, cy + dy * i, tick); }
  }
}

export function boardBackgroundCanvas(g: BoardGeometry): HTMLCanvasElement {
  const p = new Px(g.w, g.h);
  const rand = seeded(7);
  // Table planks, running across, with seams, grain and nails; darker toward the edges.
  for (let y0 = 0, row = 0; y0 < g.h; y0 += 12, row++) {
    const tone = [PAL.wood2, PAL.wood1, PAL.wood2, PAL.wood3][row % 4]!;
    p.rect(0, y0, g.w, 12, tone);
    p.rect(0, y0, g.w, 1, PAL.wood0);
    p.rect(0, y0 + 1, g.w, 1, row % 4 === 3 ? PAL.wood4 : PAL.wood3);
    for (let i = 0; i < 14; i++) {
      const gx = Math.floor(rand() * g.w), gy = y0 + 3 + Math.floor(rand() * 8), len = 4 + Math.floor(rand() * 14);
      p.rect(gx, gy, len, 1, tone === PAL.wood1 ? PAL.wood0 : PAL.wood1);
    }
    const seam = Math.floor(rand() * g.w);
    p.rect(seam, y0 + 1, 1, 11, PAL.wood0);
    p.px(seam + 3, y0 + 4, PAL.stone3).px(seam + 3, y0 + 9, PAL.stone3);
  }
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const e = Math.min(x, y, g.w - 1 - x, g.h - 1 - y);
    if (e < 6 && bayer(x, y) < (6 - e) / 9) p.px(x, y, PAL.wood0);
  }

  // The playmat: a felt rectangle with a shadow on the table, a stitched edge, and lane seams.
  const f = g.field;
  const mat: R = { x: f.x + 1, y: f.y + 1, w: f.w - 2, h: f.h - 2 };
  p.rect(mat.x + 2, mat.y + 2, mat.w, mat.h, PAL.wood0);
  p.rect(mat.x, mat.y, mat.w, mat.h, PAL.moss1);
  for (let y = mat.y; y < mat.y + mat.h; y++) for (let x = mat.x; x < mat.x + mat.w; x++) {
    // Woven felt: two tones on a diagonal weave, lit a little toward the top left.
    const lit = 1 - ((x - mat.x) / mat.w) * 0.5 - ((y - mat.y) / mat.h) * 0.5;
    if ((x + y * 3) % 7 === 0) continue;
    if (bayer(x, y) < 0.38 + lit * 0.4) p.px(x, y, PAL.moss2);
  }
  p.bevel(mat, PAL.moss3, PAL.stone0);
  stitch(p, { x: mat.x + 2, y: mat.y + 2, w: mat.w - 4, h: mat.h - 4 }, PAL.paper3);
  for (let i = 1; i < g.lanes.length; i++) {
    const x = g.lanes[i]!.x;
    for (let y = mat.y + 4; y < mat.y + mat.h - 4; y++) {
      p.px(x - 1, y, PAL.stone0);
      if (y % 4 < 2) p.px(x, y, PAL.moss3);
    }
  }
  // Rope midline with a small seal in the centre.
  const mid = Math.floor(g.h / 2) - 1;
  for (let x = mat.x + 3; x < mat.x + mat.w - 3; x++) {
    p.px(x, mid, (x >> 1) % 2 ? PAL.paper3 : PAL.paper4);
    p.px(x, mid + 1, (x >> 1) % 2 ? PAL.paper4 : PAL.wood2);
    p.px(x, mid + 2, PAL.stone0);
  }
  const cx = Math.floor(f.x + f.w / 2);
  for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
    const d = Math.abs(x) + Math.abs(y);
    if (d <= 4) p.px(cx + x, mid + y, d === 4 ? PAL.ink : x + y < 0 ? PAL.gold4 : PAL.gold2);
  }
  p.px(cx, mid, PAL.arc2);

  for (const r of g.monsterSlots) slot(p, r, PAL.moss1, PAL.stone0, PAL.moss3, PAL.paper3);
  for (const r of g.spellSlots) slot(p, r, PAL.stone0, PAL.ink, PAL.moss2, PAL.gold2);

  // Velvet Sigil mats with a gold stitch.
  for (const r of g.sigilMats) {
    p.rect(r.x + 1, r.y + 1, r.w, r.h, PAL.wood0);
    p.rect(r.x, r.y, r.w, r.h, PAL.night);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if ((x + y) % 6 === 0 || (x - y + 600) % 6 === 0) p.px(x, y, PAL.dusk);
    }
    p.bevel(r, PAL.plum, PAL.ink);
    stitch(p, { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 }, PAL.gold2);
  }
  // Leather pads for piles.
  for (const r0 of [...g.decks, ...g.discards]) {
    const r = { x: r0.x - 2, y: r0.y - 2, w: r0.w + 4, h: r0.h + 4 };
    p.rect(r.x + 1, r.y + 1, r.w, r.h, PAL.wood0);
    p.rect(r.x, r.y, r.w, r.h, PAL.wood1);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (bayer(x, y) < 0.18) p.px(x, y, PAL.wood2);
    p.bevel(r, PAL.wood3, PAL.wood0);
    stitch(p, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, PAL.paper4);
  }
  // Slate plaques behind the LP numbers.
  for (const r of g.plaques) {
    p.rect(r.x + 1, r.y + 1, r.w, r.h, PAL.wood0);
    p.rect(r.x, r.y, r.w, r.h, PAL.ink);
    p.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, PAL.night);
    p.bevel({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, PAL.dusk, PAL.ink);
    for (const [x, y] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]] as const) p.px(x, y, PAL.gold2);
  }
  return p.c;
}
