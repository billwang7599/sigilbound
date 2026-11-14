/** A 3×5 pixel font for numbers and a few symbols, outlined so it reads on any background. */
const GLYPHS: Record<string, string[]> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", ".##", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", ".#.", ".#.", ".#."],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
  "-": ["...", "...", "###", "...", "..."],
  "+": ["...", ".#.", "###", ".#.", "..."],
  "/": ["..#", "..#", ".#.", "#..", "#.."],
};

const cache = new Map<string, HTMLCanvasElement>();

export function digitsCanvas(text: string, color: string, outline = "#1c1a24"): HTMLCanvasElement {
  const key = `${text}|${color}|${outline}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const chars = [...text].filter((ch) => GLYPHS[ch]);
  const w = Math.max(1, chars.length * 4 - 1) + 2, h = 7;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const on = (x: number, y: number) => {
    const i = Math.floor((x - 1) / 4), gx = (x - 1) % 4, gy = y - 1;
    const g = GLYPHS[chars[i] ?? ""];
    return !!g && gx >= 0 && gx < 3 && gy >= 0 && gy < 5 && g[gy]![gx] === "#";
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (on(x, y)) ctx.fillStyle = color;
      else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1) || on(x - 1, y - 1) || on(x + 1, y + 1) ||
        on(x - 1, y + 1) || on(x + 1, y - 1)) ctx.fillStyle = outline;
      else continue;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  cache.set(key, c);
  return c;
}
