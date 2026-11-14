/**
 * The overworld's rules, with no Pixi and no DOM: the hub map, what you can walk on, moving with collision,
 * which way you face, which NPC you can talk to, and the world ⇄ duel hand-off. world/ draws all of this; tests
 * check it directly.
 *
 * Coordinates are world pixels (16 per tile). A walker's position is the point between its feet; its hitbox is a
 * small box around that point, so heads and hair can overlap trees and roofs (Stardew-style faked depth).
 */
export const TILE = 16;

export type Dir = "down" | "up" | "left" | "right";
export interface Vec { x: number; y: number }

/** Ground under everything: drawn once into one big canvas. */
export type Ground = "grass" | "flowers" | "path" | "water" | "sand" | "cobble";

export type PropKind = "tree" | "pine" | "house" | "stall" | "fence" | "rock" | "well" | "bush" | "lamp" | "sign";

/** Things standing on the ground. `x, y, w, h` is the blocked footprint in tiles; art may rise above it. */
export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Art variant (house colour, stall awning, …). */
  v?: number;
}

export interface WorldMap {
  w: number;
  h: number;
  ground: Ground[];
  props: Prop[];
  /** true = something solid on that tile (water, a tree trunk, a wall, a fence). */
  blocked: boolean[];
  /** Where you appear the first time. */
  start: Vec;
}

/**
 * The hub, one character per tile:
 *   .  grass        *  flowers     :  path        ~  water      s  sand (pond rim)   c  cobbles (plaza)
 *   T  tree         P  pine        #  fence       o  rock       b  bush
 * Houses, stalls, the well, lamps and the sign are placed below by footprint; their tiles here are plain ground.
 */
export const HUB_ROWS = [
  "TPTPTTPTTPTTPTTTPTTPTTPTTPTTPT",
  "T....*.........:.......*....PT",
  "P..............:.............T",
  "T..............:.......*.....P",
  "T.*............:.............T",
  "P...:::::::::::::::::::::::..T",
  "T...:..........:.........:..*P",
  "T...:...b......:.....b...:...T",
  "P.*.:..........:.........:...T",
  "T...::::::::::::::::::::::...T",
  "T.......*...ccccccc....*.....P",
  "P...........ccccccc..........T",
  "T...~~~.....ccccccc.#########T",
  "T..~~~~~....ccccccc.#**.***.#P",
  "P..~~~~~....o..:....#.***.*.#T",
  "T...~~~........:....#**.***.#T",
  "T..........*...:....####:####P",
  "P..............:..b.....:....T",
  "T..*...........:........:....T",
  "TPTTPTTPTTPTTPTTPTTPTTPTTPTTPT",
] as const;

/** Buildings and set pieces, by footprint (tiles). Houses are 4×3 with the door at the bottom middle. */
const PLACED: Prop[] = [
  { kind: "house", x: 4, y: 1, w: 4, h: 3, v: 0 },
  { kind: "house", x: 20, y: 1, w: 4, h: 3, v: 1 },
  { kind: "stall", x: 17, y: 6, w: 3, h: 2, v: 0 },
  { kind: "stall", x: 10, y: 6, w: 3, h: 2, v: 1 },
  { kind: "well", x: 14, y: 11, w: 3, h: 2 },
  { kind: "lamp", x: 13, y: 8, w: 1, h: 1 },
  { kind: "lamp", x: 17, y: 8, w: 1, h: 1 },
  { kind: "sign", x: 9, y: 16, w: 1, h: 1 },
];

const GROUND_OF: Record<string, Ground> = { ".": "grass", "*": "flowers", ":": "path", "~": "water", s: "sand", c: "cobble" };
const PROP_OF: Record<string, PropKind> = { T: "tree", P: "pine", "#": "fence", o: "rock", b: "bush" };

/** Build a map from rows of the legend above plus placed props. */
export function buildMap(rows: readonly string[], placed: Prop[], start: Vec): WorldMap {
  const h = rows.length, w = rows[0]!.length;
  const ground: Ground[] = [];
  const props: Prop[] = [];
  for (let y = 0; y < h; y++) {
    const row = rows[y]!;
    if (row.length !== w) throw new Error(`map row ${y} is ${row.length} wide, expected ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = row[x]!;
      ground.push(GROUND_OF[ch] ?? "grass");
      const kind = PROP_OF[ch];
      if (kind) props.push({ kind, x, y, w: 1, h: 1 });
    }
  }
  props.push(...placed);
  const blocked = ground.map((g) => g === "water");
  for (const p of props) {
    for (const t of footprint(p)) if (t.x >= 0 && t.y >= 0 && t.x < w && t.y < h) blocked[t.y * w + t.x] = true;
  }
  return { w, h, ground, props, blocked, start };
}

/** The blocked tiles of a prop (its whole footprint). */
export function footprint(p: Prop): Vec[] {
  const out: Vec[] = [];
  for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) out.push({ x: p.x + i, y: p.y + j });
  return out;
}

export const HUB: WorldMap = buildMap(HUB_ROWS, PLACED, { x: 15 * TILE + 8, y: 14 * TILE + 12 });

export const groundAt = (m: WorldMap, tx: number, ty: number): Ground | null =>
  tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? null : m.ground[ty * m.w + tx]!;

/** Off the map counts as blocked. `extra` adds solid tiles (where NPCs stand). */
export function isBlocked(m: WorldMap, tx: number, ty: number, extra?: ReadonlySet<string>): boolean {
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return true;
  return m.blocked[ty * m.w + tx]! || (extra?.has(`${tx},${ty}`) ?? false);
}

/** The walker's hitbox around its feet: 10 wide, 6 tall, sitting on the feet point. */
export const HIT = { halfW: 5, up: 6, down: 0 } as const;

/** Does a walker standing at `p` overlap anything solid? */
export function collides(m: WorldMap, p: Vec, extra?: ReadonlySet<string>): boolean {
  const x0 = p.x - HIT.halfW, x1 = p.x + HIT.halfW - 0.001;
  const y0 = p.y - HIT.up, y1 = p.y + HIT.down - 0.001;
  const tx0 = Math.floor(x0 / TILE), tx1 = Math.floor(x1 / TILE);
  const ty0 = Math.floor(y0 / TILE), ty1 = Math.floor(y1 / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (isBlocked(m, tx, ty, extra)) return true;
  return false;
}

export interface Input { up: boolean; down: boolean; left: boolean; right: boolean }
export const NO_INPUT: Input = { up: false, down: false, left: false, right: false };

/** Walking speed, pixels per second (about 4.5 tiles a second). */
export const SPEED = 72;

/**
 * Which way to face for the held keys. If you're already facing one of the held directions, keep it (so walking
 * diagonally doesn't flicker between two facings); otherwise up/down win over left/right.
 */
export function facingFor(input: Input, current: Dir): Dir {
  const held: Dir[] = [];
  if (input.up && !input.down) held.push("up");
  if (input.down && !input.up) held.push("down");
  if (input.left && !input.right) held.push("left");
  if (input.right && !input.left) held.push("right");
  if (!held.length) return current;
  return held.includes(current) ? current : held[0]!;
}

/** Move along one axis by `d`, stopping flush against whatever is in the way. */
function slide(m: WorldMap, p: Vec, axis: "x" | "y", d: number, extra?: ReadonlySet<string>): Vec {
  let cur = p;
  let left = Math.abs(d);
  const s = Math.sign(d);
  while (left > 0) {
    const step = Math.min(1, left);
    const next = axis === "x" ? { x: cur.x + s * step, y: cur.y } : { x: cur.x, y: cur.y + s * step };
    if (collides(m, next, extra)) {
      // Close the last sub-pixel gap: put the hitbox's leading edge exactly on the tile edge it ran into.
      const v = axis === "x" ? next.x : next.y;
      const lo = axis === "x" ? HIT.halfW : HIT.up, hi = axis === "x" ? HIT.halfW : HIT.down;
      const flush = s > 0 ? Math.floor((v + hi - 0.001) / TILE) * TILE - hi : (Math.floor((v - lo) / TILE) + 1) * TILE + lo;
      const c = axis === "x" ? cur.x : cur.y;
      if ((s > 0 ? flush > c && flush <= v : flush < c && flush >= v)) {
        const snapped = axis === "x" ? { x: flush, y: cur.y } : { x: cur.x, y: flush };
        if (!collides(m, snapped, extra)) cur = snapped;
      }
      break;
    }
    cur = next;
    left -= step;
  }
  return cur;
}

export interface Walker { pos: Vec; facing: Dir; moving: boolean }

/**
 * One movement step: the held keys for `dtMs`. X and Y are tried separately, so pushing diagonally into a wall
 * slides along it. Diagonals are normalised (no faster than straight).
 */
export function step(m: WorldMap, w: Walker, input: Input, dtMs: number, extra?: ReadonlySet<string>): Walker {
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const facing = facingFor(input, w.facing);
  if (!dx && !dy) return { pos: w.pos, facing, moving: false };
  const len = Math.hypot(dx, dy);
  const dist = (SPEED * Math.min(dtMs, 100)) / 1000;
  let pos = w.pos;
  if (dx) pos = slide(m, pos, "x", (dx / len) * dist, extra);
  if (dy) pos = slide(m, pos, "y", (dy / len) * dist, extra);
  return { pos, facing, moving: pos.x !== w.pos.x || pos.y !== w.pos.y };
}

export const DIR_VEC: Record<Dir, Vec> = { down: { x: 0, y: 1 }, up: { x: 0, y: -1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

/** Someone standing in the world: where (feet, world pixels). */
export interface Standing { id: string; pos: Vec }

/** Feet position of something standing on tile (tx, ty): the middle of the tile, near its bottom edge. */
export const tileFeet = (tx: number, ty: number): Vec => ({ x: tx * TILE + 8, y: ty * TILE + 13 });

/** The tiles NPCs stand on, as solid tiles for collision. */
export function solidTiles(others: Standing[]): Set<string> {
  return new Set(others.map((o) => `${Math.floor(o.pos.x / TILE)},${Math.floor((o.pos.y - 1) / TILE)}`));
}

/** Talk range: 1.5 tiles from your feet, or within a tile of the spot right in front of you. */
export const TALK_RANGE = 24;
const FRONT_REACH = 12;
const FRONT_RANGE = 16;

/**
 * Who you'd talk to now: the NPC in front of you if any, otherwise the nearest one within talk range. Null if
 * nobody is close enough.
 */
export function talkTarget(player: { pos: Vec; facing: Dir }, others: Standing[]): string | null {
  const v = DIR_VEC[player.facing];
  const probe = { x: player.pos.x + v.x * FRONT_REACH, y: player.pos.y + v.y * FRONT_REACH };
  let best: { id: string; score: number } | null = null;
  for (const o of others) {
    const front = Math.hypot(o.pos.x - probe.x, o.pos.y - probe.y);
    const near = Math.hypot(o.pos.x - player.pos.x, o.pos.y - player.pos.y);
    let score: number;
    if (front <= FRONT_RANGE) score = front;
    else if (near <= TALK_RANGE) score = 100 + near;
    else continue;
    if (!best || score < best.score) best = { id: o.id, score };
  }
  return best?.id ?? null;
}

/** The facing that looks from `from` toward `to` (NPCs turn to you when you talk). */
export function faceToward(from: Vec, to: Vec): Dir {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

/** The camera's top-left for a view of vw×vh centred on `focus`, kept inside the map, whole pixels. */
export function camera(m: WorldMap, focus: Vec, vw: number, vh: number): Vec {
  const mw = m.w * TILE, mh = m.h * TILE;
  const axis = (f: number, v: number, size: number) =>
    size <= v ? Math.round((size - v) / 2) : Math.round(Math.max(0, Math.min(size - v, f - v / 2)));
  return { x: axis(focus.x, vw, mw), y: axis(focus.y - 8, vh, mh) };
}

// ---- world ⇄ duel ----

/**
 * What the world remembers across a duel: where you stood, which way you faced, the duel in progress (which NPC),
 * and how the last one ended (so that NPC can say something about it when you're back).
 */
export interface WorldSession {
  pos: Vec;
  facing: Dir;
  duel: { npcId: string } | null;
  aftermath: { npcId: string; won: boolean } | null;
}

export const freshSession = (m: WorldMap = HUB): WorldSession => ({ pos: { ...m.start }, facing: "up", duel: null, aftermath: null });

/** Leaving the world for a duel with an NPC: remember where you were. */
export function beginDuel(_s: WorldSession, npcId: string, pos: Vec, facing: Dir): WorldSession {
  return { pos: { ...pos }, facing, duel: { npcId }, aftermath: null };
}

/** The duel ended and you chose to go back: same spot, and the NPC gets a line about the result. */
export function endDuel(s: WorldSession, won: boolean): WorldSession {
  if (!s.duel) return s;
  return { pos: s.pos, facing: s.facing, duel: null, aftermath: { npcId: s.duel.npcId, won } };
}

/** You left the duel some other way (menu, a different duel): forget it, keep your spot. */
export const abandonDuel = (s: WorldSession): WorldSession => ({ ...s, duel: null });

/** The NPC's after-duel line has been shown. */
export const clearAftermath = (s: WorldSession): WorldSession => ({ ...s, aftermath: null });

/** Saved sessions come from localStorage: anything odd falls back to a fresh one, positions stay on walkable ground. */
export function parseSession(raw: unknown, m: WorldMap = HUB): WorldSession {
  const fresh = freshSession(m);
  let v: unknown = raw;
  if (typeof raw === "string") {
    try { v = JSON.parse(raw); } catch { return fresh; }
  }
  if (!v || typeof v !== "object") return fresh;
  const o = v as Record<string, unknown>;
  const pos = o.pos as Record<string, unknown> | undefined;
  const okPos = !!pos && typeof pos.x === "number" && typeof pos.y === "number" && Number.isFinite(pos.x) && Number.isFinite(pos.y) &&
    !collides(m, { x: pos.x, y: pos.y });
  const dirs: Dir[] = ["down", "up", "left", "right"];
  const facing = dirs.includes(o.facing as Dir) ? (o.facing as Dir) : fresh.facing;
  const duel = o.duel && typeof (o.duel as Record<string, unknown>).npcId === "string" ? { npcId: (o.duel as { npcId: string }).npcId } : null;
  const af = o.aftermath as Record<string, unknown> | null | undefined;
  const aftermath = af && typeof af.npcId === "string" && typeof af.won === "boolean" ? { npcId: af.npcId, won: af.won } : null;
  return { pos: okPos ? { x: pos!.x as number, y: pos!.y as number } : fresh.pos, facing, duel, aftermath };
}
