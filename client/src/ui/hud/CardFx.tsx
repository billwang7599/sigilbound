/**
 * HUD card effects (DOM/CSS, so the card's text stays crisp above them):
 *  - a slight 3D tilt toward the cursor on hover,
 *  - a glossy specular spot that follows the cursor,
 *  - a foil/holo sheen (always on rare cards, cost 5+; on hover for the rest),
 *  - a subtle per-Crest touch over the art window: Ember heat shimmer, Tide caustics, Stone glints, Gale drift.
 * All of it is gated by the Graphics setting through <html data-gfx> (see styles.css). Face-down cards never get here.
 */
import { card } from "@sigilbound/engine";
import { useRef } from "react";
import { CARD_LAYOUT } from "../../gfx/frames.js";

const CREST: Record<string, string> = { fire: "ember", water: "tide", earth: "stone", air: "gale" };

export function CardFx({ id, size, enabled, children }: { id: string; size: "hand" | "big"; enabled: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!enabled) return <>{children}</>;
  const def = card(id);
  const rare = def.cost >= 5;
  const crest = def.kind === "monster" ? CREST[def.affinity] ?? "" : "";
  const L = CARD_LAYOUT[size];
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || document.documentElement.dataset.gfx === "off") return;
    const r = el.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width, my = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${(mx * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(my * 100).toFixed(1)}%`);
    el.style.setProperty("--ry", `${((mx - 0.5) * 10).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${((0.5 - my) * 10).toFixed(2)}deg`);
    el.style.setProperty("--hue", `${Math.round(mx * 220 + my * 140)}deg`);
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };
  // The art window as a fraction of the card, so the Crest layer sits over the art at any size.
  const w = L.window;
  const win = { left: `${(w.x / L.w) * 100}%`, top: `${(w.y / L.h) * 100}%`, width: `${(w.w / L.w) * 100}%`, height: `${(w.h / L.h) * 100}%` };
  return (
    <div ref={ref} className={`cardfx${rare ? " cardfx-rare" : ""}`} onPointerMove={move} onPointerLeave={leave}>
      {children}
      {crest ? <span className={`cardfx-crest cardfx-${crest}`} style={win} aria-hidden /> : null}
      <span className="cardfx-holo" aria-hidden />
      <span className="cardfx-gloss" aria-hidden />
    </div>
  );
}
