/**
 * The world session (where you stood, the duel in progress, how the last one ended), kept in localStorage so a
 * reload mid-duel still offers "Return to the world". The transitions themselves are pure, in core/world.ts.
 */
import { abandonDuel, beginDuel, clearAftermath, endDuel, parseSession, type Dir, type Vec, type WorldSession } from "../core/world.js";
import { Store } from "../ui/store.js";

const KEY = "sigilbound.world";

function load(): WorldSession {
  try { return parseSession(typeof localStorage === "undefined" ? null : localStorage.getItem(KEY)); } catch { return parseSession(null); }
}

export const worldSession = new Store<{ s: WorldSession }>({ s: load() });

function put(s: WorldSession): void {
  worldSession.set({ s });
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

export const session = {
  get: (): WorldSession => worldSession.get().s,
  /** Remember the spot without starting anything (leaving the world for the title). */
  remember(pos: Vec, facing: Dir): void { put({ ...worldSession.get().s, pos: { ...pos }, facing }); },
  beginDuel(npcId: string, pos: Vec, facing: Dir): void { put(beginDuel(worldSession.get().s, npcId, pos, facing)); },
  endDuel(won: boolean): void { put(endDuel(worldSession.get().s, won)); },
  abandonDuel(): void { put(abandonDuel(worldSession.get().s)); },
  clearAftermath(): void { put(clearAftermath(worldSession.get().s)); },
};
