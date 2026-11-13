/**
 * Screen layout maths (pure; ui/layout.ts applies it): the board (BOARD_W × BOARD_H art pixels) scales by a whole
 * number so pixels stay square, and the HUD by `u` (1 to 2). Biggest board that fits first, then the biggest HUD
 * that keeps it: 1280×800 → 3× board, 1× HUD; 1920×1080 → 4× board, 1.25× HUD.
 */
export const BOARD_W = 336, BOARD_H = 216;
/** Unscaled heights reserved for the top bar and the hand's visible strip, and the side margin. */
const TOP = 36, HAND = 112, SIDE = 16;

export interface Layout { u: number; k: number; top: number; hand: number }

export function computeLayout(W: number, H: number): Layout {
  const uMax = W >= 2400 && H >= 1300 ? 2 : W >= 1800 && H >= 1000 ? 1.5 : W >= 1500 && H >= 900 ? 1.25 : 1;
  let best: Layout | null = null;
  for (const u of [2, 1.75, 1.5, 1.25, 1]) {
    if (u > uMax) continue;
    const top = Math.round(TOP * u), hand = Math.round(HAND * u);
    const k = Math.min((W - SIDE) / BOARD_W, (H - top - hand) / BOARD_H);
    const kk = k >= 1 ? Math.floor(k) : Math.max(0.25, k);
    if (!best || kk > best.k) best = { u, k: kk, top, hand };
  }
  return best!;
}
