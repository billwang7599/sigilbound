/**
 * Original pixel art, drawn in code: every monster is grown from its card id (a mirrored body, smoothed, then
 * outlined, shaded and given eyes and affinity features), so each card has a stable look without any copied art.
 * Everything returns a small canvas: Pixi turns it into a nearest-sampled texture, the HUD into an <img>.
 */
import { card, type Affinity, type FieldId } from "@sigilbound/engine";
import { AFFINITY, FIELD_TILES, UI } from "./palette.js";

export const MONSTER_PX = 24;

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

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

const cache = new Map<string, HTMLCanvasElement>();
function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = cache.get(key);
  if (!c) cache.set(key, (c = make()));
  return c;
}

/** 0 empty, 1 body, 2 accent, 3 eye white, 4 pupil. */
type Grid = number[][];

function grow(id: string, affinity: Affinity, cost: number): Grid {
  const N = MONSTER_PX, half = N / 2;
  const rand = seeded(id);
  const g: Grid = Array.from({ length: N }, () => Array(N).fill(0));
  const size = 0.55 + Math.min(cost, 6) * 0.07; // bigger cards are bigger critters
  const bodyRx = (4 + rand() * 3) * size + 1.5, bodyRy = (4 + rand() * 2.5) * size + 1;
  const bodyCy = 15 - rand() * 2;
  const headR = (3 + rand() * 2) * size + 1;
  const headCy = bodyCy - bodyRy * 0.9 - headR * 0.4;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < half; x++) {
      const dx = half - 0.5 - x;
      const inBody = (dx / bodyRx) ** 2 + ((y - bodyCy) / bodyRy) ** 2 <= 1;
      const inHead = (dx / headR) ** 2 + ((y - headCy) / headR) ** 2 <= 1;
      const noise = rand() < 0.18 && (dx / (bodyRx + 1.5)) ** 2 + ((y - bodyCy) / (bodyRy + 1.5)) ** 2 <= 1;
      if (inBody || inHead || noise) g[y]![x] = 1;
    }
  }
  // Smooth (one cellular step) so noise becomes lumps, not static.
  const copy = g.map((r) => [...r]);
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < half; x++) {
      let n = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (copy[y + oy]![x + ox]) n++;
      g[y]![x] = n >= 5 ? 1 : n <= 2 ? 0 : copy[y]![x]!;
    }
  }
  // Legs.
  const legX = Math.round(half - bodyRx * 0.55);
  const legTop = Math.round(bodyCy + bodyRy * 0.6);
  for (let y = legTop; y < Math.min(N - 1, legTop + 3 + Math.floor(rand() * 2)); y++) {
    g[y]![legX] = 1;
    if (rand() < 0.6) g[y]![legX - 1] = 1;
  }
  // Affinity features, in the accent colour.
  const top = Math.max(1, Math.round(headCy - headR));
  const hx = Math.round(half - headR * 0.6);
  if (affinity === "fire") {
    for (let i = 0; i < 3; i++) if (top - i >= 0) g[top - i]![Math.max(0, hx - i)] = 2; // horns
    const tailY = Math.round(bodyCy);
    for (let i = 0; i < 3; i++) g[tailY - i]![Math.max(0, Math.round(half - bodyRx) - 1 - i)] = 2;
  } else if (affinity === "water") {
    const finY = Math.round(bodyCy - bodyRy * 0.2);
    for (let i = 0; i < 3; i++) g[finY + i]![Math.max(0, Math.round(half - bodyRx) - 1)] = 2;
    for (let i = 0; i < 2; i++) if (top - 1 >= 0) g[top - 1]![half - 1 - i] = 2; // crest
  } else if (affinity === "air") {
    const wy = Math.round(bodyCy - bodyRy * 0.5);
    for (let i = 0; i < 4; i++) for (let j = 0; j <= i; j++) {
      const x = Math.round(half - bodyRx) - 1 - j, y = wy - 2 + i;
      if (x >= 0 && y >= 0) g[y]![x] = 2;
    }
  } else if (affinity === "earth") {
    for (let i = 0; i < 4; i++) {
      const x = Math.round(half - 1 - rand() * bodyRx), y = Math.round(bodyCy - bodyRy * 0.8 - rand());
      if (g[y + 1]?.[x]) g[y]![x] = 2; // mossy/rocky bumps
    }
  }
  // Eyes on the head.
  const ey = Math.round(headCy - headR * 0.1);
  const ex = Math.round(half - 1 - headR * 0.35);
  if (g[ey]?.[ex]) {
    g[ey]![ex] = 3;
    g[ey + 1]![ex] = 4;
    if (cost >= 4 && g[ey]![ex - 1]) g[ey]![ex - 1] = 3;
  }
  // Mirror.
  for (let y = 0; y < N; y++) for (let x = 0; x < half; x++) g[y]![N - 1 - x] = g[y]![x]!;
  return g;
}

/** A 24×24 monster. */
export function monsterCanvas(id: string): HTMLCanvasElement {
  return cached(`m:${id}`, () => {
    const def = card(id);
    const pal = AFFINITY[def.affinity];
    const g = grow(id, def.affinity, def.cost);
    const N = MONSTER_PX;
    const [c, ctx] = canvas(N, N);
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? 0 : g[y]![x]!);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const v = at(x, y);
        let color: string | null = null;
        if (!v) {
          if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) color = pal.body[0];
        } else if (v === 3) color = "#ffffff";
        else if (v === 4) color = UI.ink;
        else {
          const ramp = v === 2 ? pal.accent : pal.body;
          // Light from the top left.
          color = !at(x, y - 1) || !at(x - 1, y) ? ramp[3] : !at(x, y + 1) || !at(x + 1, y + 1) ? ramp[1] : ramp[2];
        }
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    return c;
  });
}

/** 16×16 icons for spells, by kind. */
const SPELL_ICONS: Record<string, string[]> = {
  quick: [
    "................", ".........##.....", "........#yy#....", ".......#yy#.....", "......#yy#......",
    ".....#yyyy###...", "....#yyyyyyy#...", "...###yyyy#.....", ".....#yy#.......", "....#yy#........",
    "...#yy#.........", "..#yy#..........", "..#y#...........", "..##............", "................",
    "................",
  ],
  prepared: [
    "................", "..###########...", ".#ppppppppppp#..", ".#p#########p#..", "..#wwwwwwwww#...",
    "..#w.......w#...", "..#w.##.##.w#...", "..#w.......w#...", "..#w.###.#.w#...", "..#w.......w#...",
    "..#wwwwwwwww#...", ".#p#########p#..", ".#ppppppppppp#..", "..###########...", "................",
    "................",
  ],
  ambush: [
    "................", "................", "....########....", "...#rrrrrrrr#...", "..#rr######rr#..",
    ".#rr#wwwwww#rr#.", ".#r#ww#kk#ww#r#.", ".#r#w#kkkk#w#r#.", ".#r#ww#kk#ww#r#.", ".#rr#wwwwww#rr#.",
    "..#rr######rr#..", "...#rrrrrrrr#...", "....########....", "................", "................",
    "................",
  ],
};
const ICON_COLORS: Record<string, string> = {
  "#": UI.ink, y: "#f6cf4a", p: "#c49a52", w: "#f4e8c8", r: "#b8434a", k: "#3a2a5a",
};

export function spellCanvas(kind: string): HTMLCanvasElement {
  return cached(`s:${kind}`, () => {
    const rows = SPELL_ICONS[kind] ?? SPELL_ICONS.quick!;
    const [c, ctx] = canvas(16, 16);
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      const col = ICON_COLORS[ch];
      if (!col) return;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }));
    return c;
  });
}

/** Any card's art: a monster or its spell kind's icon. */
export function artCanvas(id: string): HTMLCanvasElement {
  const def = card(id);
  if (def.kind === "monster") return monsterCanvas(id);
  if (def.kind === "hidden") return cardBackCanvas();
  return spellCanvas(def.kind);
}

/** The back of a card, 16×20. */
export function cardBackCanvas(): HTMLCanvasElement {
  return cached("back", () => {
    const [c, ctx] = canvas(16, 20);
    ctx.fillStyle = UI.woodDark;
    ctx.fillRect(0, 0, 16, 20);
    ctx.fillStyle = "#5a3a7a";
    ctx.fillRect(1, 1, 14, 18);
    ctx.fillStyle = "#7a56a0";
    for (let y = 2; y < 18; y += 2) for (let x = 2 + (y % 4 === 0 ? 1 : 0); x < 14; x += 2) ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = UI.gold;
    ctx.fillRect(7, 6, 2, 8);
    ctx.fillRect(5, 9, 6, 2);
    return c;
  });
}

/** A Sigil gem, 7×9. */
export function sigilCanvas(tapped: boolean): HTMLCanvasElement {
  return cached(`sig:${tapped}`, () => {
    const [c, ctx] = canvas(7, 9);
    const rows = ["...#...", "..#a#..", ".#aab#.", "#aaabb#", "#aabbb#", ".#abb#.", "..#b#..", "...#...", "......."];
    const col: Record<string, string> = tapped
      ? { "#": "#3a3440", a: "#6d6577", b: "#4c4555" }
      : { "#": "#2a1a4a", a: "#c9a7ff", b: "#8a5ad8" };
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (!col[ch]) return;
      ctx.fillStyle = col[ch]!;
      ctx.fillRect(x, y, 1, 1);
    }));
    return c;
  });
}

/** A 32×32 terrain tile for a lane's field; tiles seamlessly. */
export function fieldTileCanvas(f: FieldId): HTMLCanvasElement {
  return cached(`f:${f}`, () => {
    const t = FIELD_TILES[f];
    const S = 32;
    const [c, ctx] = canvas(S, S);
    ctx.fillStyle = t.base;
    ctx.fillRect(0, 0, S, S);
    const rand = seeded(f);
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = t.specks[Math.floor(rand() * t.specks.length)]!;
      const x = Math.floor(rand() * S), y = Math.floor(rand() * S);
      const w = 1 + Math.floor(rand() * 2);
      ctx.fillRect(x, y, w, 1);
    }
    if (f === "crossroads" || f === "old_forest") {
      // Grass tufts.
      ctx.fillStyle = f === "crossroads" ? "#5f8a36" : "#2a4a1c";
      for (let i = 0; i < 8; i++) {
        const x = Math.floor(rand() * (S - 3)), y = 2 + Math.floor(rand() * (S - 3));
        ctx.fillRect(x, y, 1, 2);
        ctx.fillRect(x + 2, y, 1, 2);
        ctx.fillRect(x + 1, y - 1, 1, 3);
      }
    }
    if (f === "deep_lake") {
      ctx.fillStyle = "#8fd3ea";
      for (let i = 0; i < 4; i++) {
        const x = Math.floor(rand() * (S - 5)), y = Math.floor(rand() * S);
        ctx.fillRect(x, y, 3, 1);
        ctx.fillRect(x + 3, y - 1 < 0 ? 0 : y - 1, 2, 1);
      }
    }
    if (f === "volcano") {
      ctx.fillStyle = "#f6a23a";
      for (let i = 0; i < 3; i++) {
        const x = Math.floor(rand() * (S - 4)), y = Math.floor(rand() * S);
        ctx.fillRect(x, y, 4, 1);
        ctx.fillStyle = "#e0602c";
      }
    }
    return c;
  });
}

/** Little 7×7 keyword badges. */
const BADGES: Record<string, { rows: string[]; color: string }> = {
  guard: { rows: [".#####.", "#ggggg#", "#ggwgg#", "#gwwwg#", ".#ggg#.", "..#g#..", "...#..."], color: "#8fb8de" },
  leap: { rows: ["#......", "##.....", "#w#....", "#ww#...", "#www###", ".#wwww#", "..####."], color: "#eef1fb" },
  rush: { rows: ["...#...", "..#r#..", ".#rr#..", ".#ryr#.", "#ryyr#.", "#ryyyr#", ".#####."], color: "#e0602c" },
  awaken: { rows: ["...#...", "..#y#..", "##yyy##", "#yyyyy#", ".#yyy#.", ".#y#y#.", ".#...#."], color: "#f6cf4a" },
};

export function badgeCanvas(kind: keyof typeof BADGES): HTMLCanvasElement {
  return cached(`b:${kind}`, () => {
    const b = BADGES[kind]!;
    const [c, ctx] = canvas(7, 7);
    const col: Record<string, string> = { "#": UI.ink, g: b.color, w: b.color, r: "#e0602c", y: "#f6cf4a" };
    b.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (!col[ch]) return;
      ctx.fillStyle = col[ch]!;
      ctx.fillRect(x, y, 1, 1);
    }));
    return c;
  });
}

export function dataUrl(c: HTMLCanvasElement): string {
  return c.toDataURL();
}
