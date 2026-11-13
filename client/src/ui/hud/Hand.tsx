import { useEffect, useRef, useState } from "react";
import { plansFor } from "../../core/intent.js";
import { useGame } from "../context.js";
import { useStore } from "../useStore.js";
import { CardFace } from "./CardFace.js";
import { uiScale } from "../layout.js";

/** How long a hand card is hovered before its big preview shows. */
const PREVIEW_MS = 450;
/** Room kept free on each side of the hand (the turn dock is on the left). */
const SIDE_ROOM = 196;

/**
 * Your hand: fanned along the bottom. Hovering lifts a card (its hover area includes the space it lifts into, so it
 * never flickers); hovering a moment longer shows it big. Click selects (its menu opens above it), drag plays.
 */
export function Hand() {
  const { ui, actions } = useGame();
  const update = useStore(ui.duel, (d) => d.update);
  const hand = useStore(ui.duel, (d) => d.hand);
  const inFlight = useStore(ui.duel, (d) => d.inFlight);
  const focus = useStore(ui.duel, (d) => d.focus);
  const drag = useStore(ui.duel, (d) => d.drag);
  const popup = useStore(ui.duel, (d) => d.popup);
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const on = () => setWidth(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const timer = useRef<number | null>(null);
  const clearTimer = () => { if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => clearTimer, []);
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
  const room = Math.max(200, width / uiScale() - 2 * SIDE_ROOM - 100);
  const spread = Math.min(84, n > 1 ? room / (n - 1) : 0);
  const mulligan = update.view.state.step === "mulligan";
  return (
    <div className="u-bc absolute bottom-0 h-[150px] pointer-events-none z-[5]">
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
              data-hand-uid={c.uid}
              className={`hand-card absolute bottom-[-24px] left-1/2 pointer-events-auto ${focused || open ? "lifted" : ""} ${drag ? "" : "hoverable"} ${fresh.has(c.uid) ? "draw-in" : ""}`}
              style={{ "--x": `${x - 50}px`, "--y": `${y}px`, "--r": `${rot}deg`, zIndex: open ? 60 : focused ? 50 : 10 + i, touchAction: "none" } as React.CSSProperties}
              onPointerDown={(e) => { if (e.button === 0) { e.preventDefault(); clearTimer(); actions.hoverHand(null); actions.handPointerDown(c.uid, e); } }}
              onPointerEnter={() => {
                if (mulligan) return;
                clearTimer();
                timer.current = window.setTimeout(() => actions.hoverHand(c.uid), PREVIEW_MS);
              }}
              onPointerLeave={() => { clearTimer(); if (ui.duel.get().handHover === c.uid) actions.hoverHand(null); }}
            >
              <div className={`card-inner ${playable ? "playable" : ""} ${focused || open ? "focus-ring" : ""}`}>
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
