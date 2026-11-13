/**
 * Screen layout: how big the board and the HUD are for the window.
 *
 * The board (BOARD_W × BOARD_H art pixels) always scales by a whole number so pixels stay square. The HUD (top bar,
 * hand, turn dock, menus, tooltips) scales by `u`, a step from 1 to 2, so it isn't tiny on a big monitor or crowded
 * on a laptop. We pick the biggest board that fits first, then the biggest HUD that still leaves room for it:
 * a 1280×800 laptop gets a 3× board with a 1× HUD, a 1920×1080 monitor a 4× board with a 1.25× HUD.
 *
 * The result goes on <html> as CSS variables (--u, --top-h, --hand-h) so CSS and components read the same numbers.
 */
import { computeLayout, type Layout } from "../core/layout.js";

export type { Layout };

let current = computeLayout(window.innerWidth, window.innerHeight);
const listeners = new Set<() => void>();

function apply(): void {
  const s = document.documentElement.style;
  s.setProperty("--u", String(current.u));
  s.setProperty("--top-h", `${current.top}px`);
  s.setProperty("--hand-h", `${current.hand}px`);
}

apply();
window.addEventListener("resize", () => {
  const next = computeLayout(window.innerWidth, window.innerHeight);
  if (next.u === current.u && next.k === current.k && next.top === current.top) return;
  current = next;
  apply();
  for (const l of listeners) l();
});

/** The HUD scale right now. */
export const uiScale = (): number => current.u;
export const layout = (): Layout => current;
export function onLayout(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
