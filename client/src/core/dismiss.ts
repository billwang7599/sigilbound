/**
 * Clicking outside an open popup closes it, the same as Esc (pure, so it's tested without a browser).
 *
 * Modal overlays (card reader, deck/discard list, help, end-turn confirm, position ask...) have their own backdrop
 * that closes them; this is for the panels that don't dim the screen: a selected card's action menu, the open duel
 * log, and the Crest's board pick. Where the click landed decides what happens:
 *
 * - inside the panel itself: nothing closes.
 * - on a hand card or the board: those handle it themselves (a glowing place finishes the pick, another card
 *   switches the selection, anything else on the board just closes), so a drag that starts on a card still works.
 * - a "pass" element (the Ambush prompt, whose clock is running): panels close, the click still counts.
 * - anywhere else (a HUD button, the empty edges): panels close and the click is swallowed, so it doesn't also press
 *   whatever was under it.
 */
export type Layer = "menu" | "log" | "crest";
export type Zone = Layer | "hand" | "board" | "pass" | "other";

export interface OpenLayers {
  menu: boolean;
  log: boolean;
  crest: boolean;
  /** A modal overlay is up: it owns the click. */
  modal: boolean;
}

export function outsideClick(open: OpenLayers, zone: Zone): { close: Layer[]; swallow: boolean } {
  if (open.modal) return { close: [], swallow: false };
  const close: Layer[] = [];
  const selfHandled = zone === "hand" || zone === "board";
  if (open.log && zone !== "log") close.push("log");
  if (open.menu && zone !== "menu" && !selfHandled) close.push("menu");
  if (open.crest && zone !== "crest" && !selfHandled) close.push("crest");
  return { close, swallow: close.length > 0 && !selfHandled && zone !== "pass" };
}

/** Which zone a DOM element is in: the nearest `data-zone` ancestor, else "other". */
export function zoneOf(el: { closest(sel: string): { getAttribute(name: string): string | null } | null } | null): Zone {
  const z = el?.closest("[data-zone]")?.getAttribute("data-zone");
  return z === "menu" || z === "log" || z === "crest" || z === "hand" || z === "board" || z === "pass" ? z : "other";
}
