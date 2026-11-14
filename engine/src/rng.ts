/** Seeded RNG (mulberry32) whose whole state is one uint32 kept in GameState. */
export function nextRandom(seed: number): { value: number; seed: number } {
  const s = (seed + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, seed: s };
}

/** An integer in [0, n). */
export function randInt(state: { rng: number }, n: number): number {
  const r = nextRandom(state.rng);
  state.rng = r.seed;
  return Math.floor(r.value * n);
}

export function shuffle<T>(state: { rng: number }, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randInt(state, i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}
