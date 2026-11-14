/**
 * Writes a preview sheet of chibi looks to client/art-preview/chibi-sheet.png (scaled 4×, on a grass-ish backdrop).
 * Run: npm run art:chibi        (or: npx tsx client/test/tools/chibi-sheet.ts [scale])
 * In the browser, the same sheet is at /?chibi while the dev server runs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { installCanvasShim, type FakeCanvas } from "./canvas-shim.js";

installCanvasShim();
const { chibiSheet, PREVIEW_LOOKS } = await import("../../src/gfx/chibi.js");

const scale = Number(process.argv[2] ?? 4);
// Optional second argument: which looks to include, e.g. "0,2,5" (the zoomed close-ups go to a separate file).
const pick = process.argv[3]?.split(",").map(Number);
const sheet = chibiSheet(pick ? pick.map((i) => PREVIEW_LOOKS[i]!) : PREVIEW_LOOKS) as unknown as FakeCanvas;
const W = sheet.width * scale, H = sheet.height * scale;
const rgba = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const s = (Math.floor(y / scale) * sheet.width + Math.floor(x / scale)) * 4, d = (y * W + x) * 4;
    const a = sheet.data[s + 3]! / 255;
    const bg = [0x4e, 0x7a, 0x2a];
    for (let c = 0; c < 3; c++) rgba[d + c] = Math.round(sheet.data[s + c]! * a + bg[c]! * (1 - a));
    rgba[d + 3] = 255;
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Buffer) => {
  let c = 0xffffffff;
  for (const v of b) c = crcTable[(c ^ v) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
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
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
]);
const out = resolve(dirname(fileURLToPath(import.meta.url)), pick ? "../../art-preview/chibi-closeup.png" : "../../art-preview/chibi-sheet.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`wrote ${out} (${W}×${H})`);
