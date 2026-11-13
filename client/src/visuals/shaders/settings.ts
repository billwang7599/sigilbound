/**
 * The "Graphics" setting: off / low / high, saved in localStorage. High is the default on desktop. If the frame
 * rate stays under ~50 for a few seconds at High, the game drops to Low for the session (the saved choice stays,
 * so a faster moment or machine can try again next time).
 *
 * The level is also mirrored onto <html data-gfx="…"> so the HUD's CSS card effects can follow it.
 */
export type GfxLevel = "off" | "low" | "high";
const KEY = "sigilbound.graphics";

function initial(): GfxLevel {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "off" || v === "low" || v === "high") return v;
  } catch { /* storage blocked */ }
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return touch ? "low" : "high";
}

let chosen: GfxLevel = initial();
let auto: GfxLevel | null = null;
const listeners = new Set<() => void>();

function publish(): void {
  if (typeof document !== "undefined") document.documentElement.dataset.gfx = gfxLevel();
  for (const l of listeners) l();
}

/** The level in effect (the chosen one, unless the frame-rate guard lowered it). */
export function gfxLevel(): GfxLevel {
  return auto ?? chosen;
}
export function gfxChosen(): GfxLevel {
  return chosen;
}
export function gfxAutoLowered(): boolean {
  return auto !== null;
}

export function setGfxLevel(level: GfxLevel): void {
  chosen = level;
  auto = null;
  try { localStorage.setItem(KEY, level); } catch { /* storage blocked */ }
  publish();
}

/** Called by the frame-rate guard. */
export function autoLower(): void {
  if (gfxLevel() !== "high") return;
  auto = "low";
  publish();
}

export function onGfxChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

publish();
