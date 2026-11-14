/**
 * Just enough of a 2D canvas for Node: the pixel art code only uses createImageData/putImageData/getImageData and
 * whole-pixel drawImage of other canvases. Pixels live in an RGBA buffer, so tests can inspect them and tools can
 * write PNGs (see png.ts).
 */
export class FakeCanvas {
  width = 0;
  height = 0;
  data = new Uint8ClampedArray(0);
  private ensure(): void {
    if (this.data.length !== this.width * this.height * 4) this.data = new Uint8ClampedArray(this.width * this.height * 4);
  }
  getContext(_kind: string) {
    this.ensure();
    const self = this;
    return {
      createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: (x: number, y: number, w: number, h: number) => {
        self.ensure();
        const data = new Uint8ClampedArray(w * h * 4);
        for (let j = 0; j < h; j++) for (let i = 0; i < w * 4; i++) data[j * w * 4 + i] = self.data[((y + j) * self.width + x) * 4 + i] ?? 0;
        return { width: w, height: h, data };
      },
      putImageData: (img: { width: number; height: number; data: Uint8ClampedArray }, x: number, y: number) => {
        self.ensure();
        for (let j = 0; j < img.height; j++) {
          for (let i = 0; i < img.width; i++) {
            const tx = x + i, ty = y + j;
            if (tx < 0 || ty < 0 || tx >= self.width || ty >= self.height) continue;
            for (let c = 0; c < 4; c++) self.data[(ty * self.width + tx) * 4 + c] = img.data[(j * img.width + i) * 4 + c]!;
          }
        }
      },
      /** Source-over, whole pixels, no scaling. */
      drawImage: (src: FakeCanvas, x: number, y: number) => {
        self.ensure();
        for (let j = 0; j < src.height; j++) {
          for (let i = 0; i < src.width; i++) {
            const tx = x + i, ty = y + j;
            if (tx < 0 || ty < 0 || tx >= self.width || ty >= self.height) continue;
            const s = (j * src.width + i) * 4, d = (ty * self.width + tx) * 4;
            const a = src.data[s + 3]! / 255;
            if (!a) continue;
            for (let c = 0; c < 3; c++) self.data[d + c] = src.data[s + c]! * a + self.data[d + c]! * (1 - a);
            self.data[d + 3] = Math.max(self.data[d + 3]!, src.data[s + 3]!);
          }
        }
      },
      fillRect: () => undefined,
    };
  }
}

/** Install a global `document` that makes FakeCanvas canvases (no-op if one exists). */
export function installCanvasShim(): void {
  const g = globalThis as unknown as { document?: unknown };
  if (g.document) return;
  g.document = { createElement: (tag: string) => (tag === "canvas" ? new FakeCanvas() : {}) };
}

/** The RGBA pixels of a canvas made under the shim. */
export const pixelsOf = (c: unknown): Uint8ClampedArray => (c as FakeCanvas).data;
