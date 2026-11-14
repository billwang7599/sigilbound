/** Character creation, without React: cycling parts, checking the name, and where the title screen's "Enter the world" goes. */
import { DEFAULT_APPEARANCE, PARTS, SLOTS, normalizeAppearance, randomAppearance, type Appearance, type Slot } from "../gfx/chibi.js";

export interface Profile {
  name: string;
  appearance: Appearance;
}

export const NAME_MAX = 16;
const NAME_OK = /^[A-Za-z0-9 '_-]+$/;

export type NameCheck = { ok: true; name: string } | { ok: false; name: string; error: string };

/** Trims, then: 1–16 characters of letters, digits, spaces and ' - _. */
export function validateName(raw: unknown): NameCheck {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name) return { ok: false, name, error: "Give your character a name." };
  if (name.length > NAME_MAX) return { ok: false, name, error: `Names are at most ${NAME_MAX} characters.` };
  if (!NAME_OK.test(name)) return { ok: false, name, error: "Use letters, numbers, spaces, ' - and _ only." };
  return { ok: true, name };
}

/** The next (+1) or previous (-1) option for a slot, wrapping at both ends. Unknown current values start from the first option. */
export function cycle(slot: Slot, a: Appearance, step: number): Appearance {
  const opts = PARTS[slot];
  const i = opts.indexOf(a[slot]);
  const n = opts.length;
  const next = i < 0 ? 0 : (((i + step) % n) + n) % n;
  return { ...a, [slot]: opts[next]! };
}

/** The keyboard-highlighted row, wrapping. */
export function moveRow(row: number, step: number): number {
  const n = SLOTS.length;
  return (((row + step) % n) + n) % n;
}

export interface CreationState {
  appearance: Appearance;
  name: string;
  row: number;
}

/** Editing an existing character starts from it; a new one starts from a random look. */
export function initialCreation(profile: Profile | null, seed: number | string): CreationState {
  if (profile) return { appearance: normalizeAppearance(profile.appearance), name: profile.name, row: 0 };
  return { appearance: randomAppearance(seed), name: "", row: 0 };
}

/** A safe Profile from anything (e.g. parsed localStorage), or null if there's no usable name. */
export function normalizeProfile(x: unknown): Profile | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const n = validateName(o.name);
  if (!n.ok) return null;
  return { name: n.name, appearance: o.appearance === undefined ? { ...DEFAULT_APPEARANCE } : normalizeAppearance(o.appearance) };
}

/** Where "Enter the world" on the title screen goes: make a character first if there isn't one. */
export function nextScreenFromTitle(profile: Profile | null): "create" | "world" {
  return profile ? "world" : "create";
}
