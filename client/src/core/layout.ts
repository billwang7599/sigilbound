/**
 * Screen layout maths (pure; ui/layout.ts applies it): the board (BOARD_W × BOARD_H art pixels) scales by a whole
 * number so pixels stay square, and the HUD by `u` (1 to 2). Biggest board that fits first, then the biggest HUD
 * that keeps it: 1280×800 → 3× board, 1× HUD; 1920×1080 → 4× board, 1.25× HUD. Height left over goes to the hand.
 */
export const BOARD_W = 336, BOARD_H = 216;
/** Unscaled heights reserved for the top bar and the hand's visible strip, and the side margin. */
const TOP = 36, HAND = 112, HAND_MIN = 84, SIDE = 16;

/** Hand cards draw their 50×70 pixel face at this many CSS pixels per card pixel (before the HUD scale `u`). */
export const HAND_CARD_SCALE = 3;
export const HAND_CARD_W = 50 * HAND_CARD_SCALE, HAND_CARD_H = 70 * HAND_CARD_SCALE;

export interface Layout { u: number; k: number; top: number; hand: number }

export function computeLayout(W: number, H: number): Layout {
  const uMax = W >= 2400 && H >= 1300 ? 2 : W >= 1800 && H >= 1000 ? 1.5 : W >= 1500 && H >= 900 ? 1.25 : 1;
  let best: Layout | null = null;
  // A short hand strip (cards peek further up when hovered) is the last resort for small windows (board under 3×),
  // only when it buys a bigger board.
  for (const strip of [HAND, HAND_MIN]) for (const u of [2, 1.75, 1.5, 1.25, 1]) {
    if (u > uMax || (strip === HAND_MIN && best!.k >= 3)) continue;
    const top = Math.round(TOP * u), hand = Math.round(strip * u);
    const k = Math.min((W - SIDE) / BOARD_W, (H - top - hand) / BOARD_H);
    const kk = k >= 1 ? Math.floor(k) : Math.max(0.25, k);
    if (!best || kk > best.k) best = { u, k: kk, top, hand };
  }
  // Room the board doesn't need goes to the hand strip (up to a whole hand card), so on 1440×900 the hand shows in full.
  const spare = H - best!.top - BOARD_H * best!.k - 8;
  best!.hand = Math.max(best!.hand, Math.min(spare, Math.round((HAND_CARD_H + 6) * best!.u)));
  return best!;
}

/**
 * How many CSS pixels per card pixel the opening-hand cards get (before `u`): the biggest whole number from 2 to 5
 * that fits `n` cards (8px apart) across the window, with room above and below for the title and buttons.
 */
export function mulliganScale(n: number, W: number, H: number, u: number): number {
  const w = W / u - 32, h = H / u - 200;
  for (let s = 5; s > 2; s--) if (n * 50 * s + (n - 1) * 8 <= w && 70 * s <= h) return s;
  return 2;
}

/**
 * The hand strip in unscaled HUD pixels: how much of each card shows (`shown`), how far below the screen edge it
 * sits (`sink`) and how far a hovered/selected card rises (`lift`, enough to show all of it).
 */
export function handGeometry(handStrip: number, u: number): { shown: number; sink: number; lift: number } {
  const shown = Math.round(handStrip / u);
  const sink = Math.max(0, HAND_CARD_H - shown);
  return { shown, sink, lift: sink + 14 };
}

export interface Box { left: number; top: number; width: number; height: number }

/**
 * Where a hand card sits once lifted, in screen pixels, from its slot's screen rect (the slot doesn't move while the
 * card animates, so this is stable mid-tween). The slot's bottom edge is the card's resting bottom edge.
 */
export function liftedCardBox(slot: { left: number; width: number; bottom: number }, lift: number, u: number): Box {
  const w = HAND_CARD_W * u, h = HAND_CARD_H * u;
  const bottom = slot.bottom - lift * u;
  return { left: slot.left + slot.width / 2 - w / 2, top: bottom - h, width: w, height: h };
}

/**
 * Where a box (w × h at `scale`) goes beside an anchor, kept 8px inside the W × H window.
 *  - "above": over the anchor, centred.
 *  - "side": right of the anchor if it fits, else left; vertically centred on it.
 *  - "card": above if it fits there whole, else beside. Never on top of the anchor when it can be avoided, so a
 *    hand card's preview or menu never covers the card itself.
 *  - no anchor: centred in the window.
 */
export function placeBox(anchor: Box | null, mode: "above" | "side" | "card", w: number, h: number, W: number, H: number,
  gap: number, uMax: number): { left: number; top: number; scale: number } {
  let scale = Math.min(uMax, (H - 16) / h, (W - 16) / w);
  let sw = w * scale, sh = h * scale;
  let left: number, top: number;
  if (!anchor) { left = (W - sw) / 2; top = (H - sh) / 2; }
  else {
    const fitsAbove = anchor.top - gap - sh >= 8;
    const m = mode === "card" ? (fitsAbove ? "above" : "side") : mode;
    if (m === "side") {
      // Too wide for either side of the anchor (a narrow window): shrink to the roomier side, down to half size.
      const room = Math.max(W - 8 - (anchor.left + anchor.width + gap), anchor.left - gap - 8);
      if (sw > room && room >= w * 0.5) { scale = room / w; sw = w * scale; sh = h * scale; }
    }
    if (m === "above") {
      left = anchor.left + anchor.width / 2 - sw / 2;
      top = anchor.top - sh - gap;
    } else {
      const right = anchor.left + anchor.width + gap;
      left = right + sw <= W - 8 || anchor.left - gap - sw < 8 ? right : anchor.left - gap - sw;
      top = anchor.top + anchor.height / 2 - sh / 2;
    }
  }
  left = Math.max(8, Math.min(W - sw - 8, left));
  top = Math.max(8, Math.min(H - sh - 8, top));
  return { left: Math.round(left), top: Math.round(top), scale };
}
