/**
 * Writes the whole hub (ground, props and people, y-sorted, no shader lighting) to client/art-preview/hub-flat.png.
 * Run: npx tsx client/test/tools/hub-sheet.ts [scale]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { installCanvasShim, type FakeCanvas } from "./canvas-shim.js";

installCanvasShim();
const { HUB, TILE, tileFeet } = await import("../../src/core/world.js");
const { groundCanvas, propArt } = await import("../../src/world/art.js");
const { NPCS } = await import("../../src/data/npcs.js");
const { chibiSprite, CHIBI_FOOT, DEFAULT_APPEARANCE } = await import("../../src/gfx/chibi.js");

const scale = Number(process.argv[2] ?? 2);
const MW = HUB.w * TILE, MH = HUB.h * TILE;
const buf = new Float64Array(MW * MH * 3);
const blit = (c: FakeCanvas, x0: number, y0: number) => {
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const tx = x0 + x, ty = y0 + y;
    if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) continue;
    const s = (y * c.width + x) * 4, a = c.data[s + 3]! / 255, d = (ty * MW + tx) * 3;
    for (let k = 0; k < 3; k++) buf[d + k] = c.data[s + k]! * a + buf[d + k]! * (1 - a);
  }
};
blit(groundCanvas(HUB) as unknown as FakeCanvas, 0, 0);
const items: { y: number; draw: () => void }[] = [];
for (const p of HUB.props) {
  const a = propArt(p, HUB);
  items.push({ y: a.sortY, draw: () => blit(a.canvas as unknown as FakeCanvas, p.x * TILE + a.dx, p.y * TILE + a.dy) });
}
const people = [...NPCS.map((n) => ({ look: n.appearance, pos: tileFeet(n.tile.x, n.tile.y), dir: n.facing })), { look: DEFAULT_APPEARANCE, pos: HUB.start, dir: "up" as const }];
for (const p of people) items.push({ y: p.pos.y, draw: () => blit(chibiSprite(p.look, p.dir, 0, { shadow: true }) as unknown as FakeCanvas, Math.round(p.pos.x) - CHIBI_FOOT.x, Math.round(p.pos.y) - CHIBI_FOOT.y) });
items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());

const W = MW * scale, H = MH * scale;
const rgba = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const s = (Math.floor(y / scale) * MW + Math.floor(x / scale)) * 3, d = (y * W + x) * 4;
  rgba[d] = buf[s]!; rgba[d + 1] = buf[s + 1]!; rgba[d + 2] = buf[s + 2]!; rgba[d + 3] = 255;
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) rgba.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../art-preview/hub-flat.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`wrote ${out} (${W}×${H})`);
