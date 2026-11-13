import { useRef } from "react";
import { plansFor } from "../../core/intent.js";
import { useGame } from "../context.js";
import { useStore } from "../useStore.js";
import { CardFace } from "./CardFace.js";

/** Your hand: fanned along the bottom; hover or keyboard focus lifts a card. Drag to play, click to read. */
export function Hand() {
  const { ui, actions } = useGame();
  const update = useStore(ui.duel, (d) => d.update);
  const hand = useStore(ui.duel, (d) => d.hand);
  const inFlight = useStore(ui.duel, (d) => d.inFlight);
  const focus = useStore(ui.duel, (d) => d.focus);
  const drag = useStore(ui.duel, (d) => d.drag);
  const popup = useStore(ui.duel, (d) => d.popup);
  // When each card first showed up, so new ones play the draw-in animation (and keep it across re-renders).
  const born = useRef(new Map<number, number>());
  const lastDuel = useRef<string | undefined>(undefined);
  if (lastDuel.current !== update?.duelId) { lastDuel.current = update?.duelId; born.current = new Map(); }
  const cards = hand.filter((c) => !inFlight.includes(c.uid));
  const now = performance.now();
  for (const c of cards) if (!born.current.has(c.uid)) born.current.set(c.uid, now);
  const fresh = new Set(cards.filter((c) => now - born.current.get(c.uid)! < 450).map((c) => c.uid));
  if (!update) return null;
  const n = cards.length;
  const spread = Math.min(84, n > 1 ? 560 / (n - 1) : 0);
  return (
    <div className="absolute inset-x-0 bottom-0 h-[150px] pointer-events-none z-[5]">
      <div className="relative h-full">
        {cards.map((c, i) => {
          const off = i - (n - 1) / 2;
          const playable = plansFor({ kind: "hand", uid: c.uid }, update).some((p) => p.action.type !== "bind");
          const focused = focus?.area === "hand" && focus.index === i;
          const open = popup?.src.kind === "hand" && popup.src.uid === c.uid;
          const x = Math.round(off * spread), rot = off * 3, y = Math.round(Math.abs(off) * Math.abs(off) * 2.5);
          return (
            <div
              key={c.uid}
              className={`hand-card absolute bottom-[-24px] left-1/2 pointer-events-auto ${focused || open ? "lifted" : ""} ${fresh.has(c.uid) ? "draw-in" : ""}`}
              style={{ "--x": `${x - 50}px`, "--y": `${y}px`, "--r": `${rot}deg`, zIndex: focused || open ? 50 : 10 + i, touchAction: "none" } as React.CSSProperties}
              onPointerDown={(e) => { e.preventDefault(); actions.handPointerDown(c.uid, e); }}
            >
              <div className={`card-inner ${playable ? "playable" : ""} ${focused ? "focus-ring" : ""} ${drag ? "" : "hoverable"}`}>
                <CardFace id={c.id} />
                <span className="absolute -top-2 -left-2 font-pixel text-[9px] bg-ink text-paper-dark px-1">{i + 1}</span>
              </div>
            </div>
          );
        })}
        {!n ? <span className="absolute bottom-6 left-1/2 -translate-x-1/2 opacity-50">Your hand is empty.</span> : null}
      </div>
    </div>
  );
}
