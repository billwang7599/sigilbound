/** The player's look and name for the world, from the saved profile (character creation writes it). */
import { DEFAULT_APPEARANCE, parseAppearance, type Appearance } from "../gfx/chibi.js";

const PROFILE_KEY = "sigilbound.profile";

/** Reads localStorage "sigilbound.profile" ({name, appearance}); anything missing or broken falls back to a default look and "You". */
export function getPlayerLook(): { name: string; appearance: Appearance } {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(PROFILE_KEY);
    if (!raw) return { name: "You", appearance: { ...DEFAULT_APPEARANCE } };
    const v = JSON.parse(raw) as { name?: unknown; appearance?: unknown };
    const name = typeof v.name === "string" && v.name.trim() ? v.name.trim().slice(0, 16) : "You";
    return { name, appearance: v.appearance === undefined ? { ...DEFAULT_APPEARANCE } : parseAppearance(JSON.stringify(v.appearance)) };
  } catch {
    return { name: "You", appearance: { ...DEFAULT_APPEARANCE } };
  }
}
