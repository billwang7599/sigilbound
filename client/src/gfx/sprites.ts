/**
 * Original pixel art, drawn in code from the one palette (gfx/palette.ts). Monster and spell art comes from the
 * shape definitions in gfx/art.ts, rendered by gfx/sculpt.ts at whatever pixel size a view needs. Card faces come
 * from gfx/frames.ts, and the board's background from gfx/board-art.ts.
 * Everything returns a small canvas: Pixi turns it into a nearest-sampled texture, the HUD into an <img>.
 */
import { card, type FieldId } from "@sigilbound/engine";
import { MONSTER_ART, PNG_ART, SPELL_ART } from "./art.js";
import { bayer, cardFaceCanvas, Px, type CardSize } from "./frames.js";
import { FIELD_TILES, PAL, UI } from "./palette.js";
import { render } from "./sculpt.js";

/** Monster art size on the board (one board pixel per art pixel). */
export const MONSTER_PX = 48;

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
  const p = new Px(w, h);
  return [p.c, p.g];
}

const cache = new Map<string, HTMLCanvasElement>();
function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = cache.get(key);
  if (!c) cache.set(key, (c = make()));
  return c;
}

/** Hand-drawn PNG overrides (see PNG_ART in art.ts), loaded once and drawn into a canvas of the right size. */
function pngArt(id: string, size: number): HTMLCanvasElement | null {
  const url = PNG_ART[id];
  if (!url) return null;
  const [c, ctx] = canvas(size, size);
  const img = new Image();
  img.onload = () => ctx.drawImage(img, 0, 0, size, size);
  img.src = url;
  return c;
}

/** A monster at `size`×`size` (48 on the board). */
export function monsterCanvas(id: string, size = MONSTER_PX): HTMLCanvasElement {
  return cached(`m:${id}:${size}`, () => {
    const png = pngArt(id, size);
    if (png) return png;
    const sc = MONSTER_ART[id];
    if (sc) return render(sc, size);
    // Unknown id: a plain silhouette so nothing crashes.
    return render({ prims: [], eyes: [] }, size);
  });
}

/** A spell's own art at `size`. */
export function spellArtCanvas(id: string, size = 48): HTMLCanvasElement {
  return cached(`sa:${id}:${size}`, () => pngArt(id, size) ?? render(SPELL_ART[id] ?? SPELL_ART.spark!, size));
}

/** 16×16 icons for spells by kind (face-up set spells on the board, small UI marks). */
const SPELL_ICONS: Record<string, string[]> = {
  quick: [
    "................", ".........##.....", "........#yy#....", ".......#yYy#....", "......#yYy#.....",
    ".....#yyyy###...", "....#yYyyyyy#...", "...###yyyy#.....", ".....#yy#.......", "....#yy#........",
    "...#yy#.........", "..#yy#..........", "..#y#...........", "..##............", "................",
    "................",
  ],
  prepared: [
    "................", "..###########...", ".#PppppppppP#...", ".#p#########p#..", "..#wwwwwwwww#...",
    "..#w.......w#...", "..#w.aa.aa.w#...", "..#w.......w#...", "..#w.aaa.a.w#...", "..#w.......w#...",
    "..#wwwwwwwww#...", ".#p#########p#..", ".#PppppppppP#...", "..###########...", "................",
    "................",
  ],
  ambush: [
    "................", "................", "....########....", "...#rrrrrrrr#...", "..#rR######rr#..",
    ".#rR#wwwwww#rr#.", ".#r#ww#kk#ww#r#.", ".#r#w#kWkk#w#r#.", ".#r#ww#kk#ww#r#.", ".#rr#wwwwww#rr#.",
    "..#rr######rr#..", "...#rrrrrrrr#...", "....########....", "................", "................",
    "................",
  ],
};
const ICON_COLORS: Record<string, string> = {
  "#": PAL.ink, y: PAL.gold3, Y: PAL.gold4, p: PAL.wood3, P: PAL.wood4, w: PAL.paper, a: PAL.arc2, r: PAL.fire1,
  R: PAL.red, k: PAL.plum, W: PAL.white,
};

function fromRows(rows: string[], colors: Record<string, string>): HTMLCanvasElement {
  const [c, ctx] = canvas(rows[0]!.length, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const col = colors[ch];
    if (!col) return;
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  }));
  return c;
}

export function spellCanvas(kind: string): HTMLCanvasElement {
  return cached(`s:${kind}`, () => fromRows(SPELL_ICONS[kind] ?? SPELL_ICONS.quick!, ICON_COLORS));
}

/** Any card's art: a monster, or the spell's own art. `size` defaults to the full 48. */
export function artCanvas(id: string, size = 48): HTMLCanvasElement {
  const def = card(id);
  if (def.kind === "monster") return monsterCanvas(id, size);
  if (def.kind === "hidden") return cardBackCanvas();
  return spellArtCanvas(id, size);
}

/** A whole card face (frame, gem, art, panels; no text) for a layout in gfx/frames.ts. */
export function cardCanvas(id: string, size: CardSize): HTMLCanvasElement {
  if (id === "hidden") return cardBackOf(size === "board" ? 56 : size === "pile" ? 28 : size === "tiny" ? 16 : 50, size === "board" ? 68 : size === "pile" ? 34 : size === "tiny" ? 20 : 70);
  // On the board the art is its own sprite (so it can breathe and flash), so the frame is drawn without it.
  return cardFaceCanvas(id, size, size === "board" ? () => document.createElement("canvas") : artCanvas);
}

/**
 * The back of a card at any size: a plum field with an arcane lattice, a gold inner line and a gold seal. Used for
 * decks, the rival's hand, face-down spells and hidden cards.
 */
export function cardBackOf(w: number, h: number): HTMLCanvasElement {
  return cached(`back:${w}x${h}`, () => {
    const p = new Px(w, h);
    p.rect(0, 0, w, h, PAL.ink).rect(1, 1, w - 2, h - 2, PAL.dusk);
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) if ((x + y) % 4 === 0 || (x - y + 400) % 4 === 0) p.px(x, y, PAL.plum);
    p.bevel({ x: 1, y: 1, w: w - 2, h: h - 2 }, PAL.mauve, PAL.night);
    if (w >= 12) {
      p.bevel({ x: 2, y: 2, w: w - 4, h: h - 4 }, PAL.gold2, PAL.gold1);
    }
    // The seal: a gold diamond with an arcane eye.
    const cx = (w - 1) / 2, cy = (h - 1) / 2, r = Math.max(1.5, Math.min(w, h) / 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.abs(x - cx) + Math.abs(y - cy);
        if (d > r + 0.2) continue;
        const lit = x - cx + (y - cy) < 0;
        p.px(x, y, d > r - 1 ? PAL.gold1 : lit ? PAL.gold4 : PAL.gold3);
      }
    }
    if (r >= 3) p.px(Math.floor(cx), Math.floor(cy), PAL.arc2).px(Math.ceil(cx), Math.ceil(cy), PAL.arc2);
    return p.c;
  });
}

/** The back of a card, 16×20 (deck piles, face-down spells, draws). */
export function cardBackCanvas(): HTMLCanvasElement {
  return cardBackOf(16, 20);
}

/** A Sigil gem, 7×9. */
export function sigilCanvas(tapped: boolean): HTMLCanvasElement {
  return cached(`sig:${tapped}`, () => fromRows(
    ["...#...", "..#a#..", ".#aab#.", "#aaabb#", "#aabbb#", ".#abb#.", "..#b#..", "...#...", "......."],
    tapped ? { "#": PAL.night, a: PAL.mauve, b: PAL.plum } : { "#": PAL.ink, a: PAL.arc3, b: PAL.arc2 },
  ));
}

/** A 32×32 terrain tile for a lane's field; tiles seamlessly. (Fields are off by default.) */
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
      ctx.fillRect(Math.floor(rand() * S), Math.floor(rand() * S), 1 + Math.floor(rand() * 2), 1);
    }
    return c;
  });
}

/** Little 7×7 keyword badges, outlined in ink so they read on any frame. */
const BADGES: Record<string, { rows: string[]; colors: Record<string, string> }> = {
  guard: { rows: [".#####.", "#lbbbb#", "#lbwbb#", "#bwwwd#", ".#bbd#.", "..#d#..", "...#..."], colors: { "#": PAL.ink, b: PAL.tide3, l: PAL.tide4, d: PAL.tide2, w: PAL.white } },
  leap: { rows: ["##.....", "#w#....", "#lw#...", "#llw###", "#lllllw", ".#dddd#", "..####."], colors: { "#": PAL.ink, w: PAL.white, l: PAL.gale3, d: PAL.gale2 } },
  rush: { rows: ["...#...", "..#r#..", ".#rr#..", ".#ryr#.", "#ryyr#.", "#ryYyr#", ".#####."], colors: { "#": PAL.ink, r: PAL.fire3, y: PAL.fire4, Y: PAL.fire5 } },
  awaken: { rows: ["...#...", "..#Y#..", "##yYy##", "#yyYyy#", ".#yyy#.", ".#d#d#.", ".#...#."], colors: { "#": PAL.ink, y: PAL.gold3, Y: PAL.gold4, d: PAL.gold2 } },
};

export function badgeCanvas(kind: keyof typeof BADGES): HTMLCanvasElement {
  return cached(`b:${kind}`, () => fromRows(BADGES[kind]!.rows, BADGES[kind]!.colors));
}

export function dataUrl(c: HTMLCanvasElement): string {
  return c.toDataURL();
}

/** A Sigil: a small face-down card with a glowing gem, 12×16. */
export function sigilCardCanvas(): HTMLCanvasElement {
  return cached("sigcard", () => {
    const p = new Px(12, 16);
    p.rect(0, 0, 12, 16, PAL.ink).rect(1, 1, 10, 14, PAL.plum);
    for (let y = 2; y < 14; y++) for (let x = 2; x < 10; x++) if (bayer(x, y) < (y - 2) / 14) p.px(x, y, PAL.dusk);
    p.bevel({ x: 1, y: 1, w: 10, h: 14 }, PAL.lilac, PAL.night);
    p.draw(sigilCanvas(false), 2.5, 3.5);
    p.px(5, 5, PAL.gale4);
    return p.c;
  });
}

/** A tiny card back for the rival's hand, 8×10. */
export function tinyBackCanvas(): HTMLCanvasElement {
  return cardBackOf(8, 10);
}

/** The plain lane surface: a woven felt, seamless 32×32 (fields are off for now). */
export function laneTileCanvas(): HTMLCanvasElement {
  return cached("lane", () => {
    const p = new Px(32, 32);
    p.rect(0, 0, 32, 32, PAL.moss2);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if ((x + y * 3) % 7 === 0) p.px(x, y, PAL.moss1);
      else if ((x * 5 + y) % 13 === 0) p.px(x, y, PAL.moss3);
    }
    return p.c;
  });
}

/** Wooden table planks, 32×32, seamless. */
export function tableTileCanvas(): HTMLCanvasElement {
  return cached("table", () => {
    const p = new Px(32, 32);
    const rand = seeded("table");
    for (let row = 0; row < 4; row++) {
      const y0 = row * 8;
      p.rect(0, y0, 32, 8, row % 2 ? PAL.wood1 : PAL.wood2);
      p.rect(0, y0, 32, 1, PAL.wood0);
      p.rect(0, y0 + 1, 32, 1, row % 2 ? PAL.wood2 : PAL.wood3);
      for (let i = 0; i < 4; i++) p.rect(Math.floor(rand() * 28), y0 + 2 + Math.floor(rand() * 5), 3 + Math.floor(rand() * 4), 1, row % 2 ? PAL.wood0 : PAL.wood1);
    }
    return p.c;
  });
}

export { UI };
