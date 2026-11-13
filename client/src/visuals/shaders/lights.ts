/**
 * Point lights for the shader layer, in board pixels. Gameplay effects push short flashes here (a summon's dust,
 * a hit's sparks, a spell reveal); the board reports its steady lights each frame (monsters by affinity, untapped
 * Sigils). With graphics off, nobody reads this, so it costs nothing.
 */
export interface Light { x: number; y: number; color: number; radius: number; intensity: number }

interface Flash extends Light { t0: number; dur: number }
const flashes: Flash[] = [];

/** A short-lived light that fades out over `ms`. */
export function lightFlash(x: number, y: number, color: number, radius: number, ms: number, intensity = 1.4): void {
  flashes.push({ x, y, color, radius, intensity, t0: performance.now(), dur: ms });
  if (flashes.length > 24) flashes.shift();
}

/** The flashes still alive, faded by age. */
export function liveFlashes(now = performance.now()): Light[] {
  const out: Light[] = [];
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]!;
    const k = (now - f.t0) / f.dur;
    if (k >= 1) { flashes.splice(i, 1); continue; }
    out.push({ x: f.x, y: f.y, color: f.color, radius: f.radius, intensity: f.intensity * (1 - k) * (1 - k) });
  }
  return out;
}
