/**
 * The Crest buttons beside the LP plaques: yours to click (or C, or arrow-focus it from the Deck button), the rival's
 * as a read-only badge. Hover or focus shows what it does and, when it can't be used, why.
 */
import { CREST_COST, type CrestId, type PlayerId } from "@sigilbound/engine";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CREST_SHORT, crestStatus, type CrestStatus } from "../../core/crest.js";
import { useGame } from "../context.js";
import { onLayout, uiScale } from "../layout.js";
import { useStore } from "../useStore.js";

/** Each Crest's colour (from gfx/palette.ts) and an 8×8 pixel icon ("#" main colour, "+" highlight). */
const LOOK: Record<CrestId, { color: string; light: string; icon: string[] }> = {
  ember: {
    color: "#ec6a2c", light: "#ffd56a",
    icon: ["...#....", "...##...", "..###...", "..##+#..", ".##++##.", ".#++++#.", ".#++++#.", "..####.."],
  },
  tide: {
    color: "#3fa2d9", light: "#bfe6ff",
    icon: ["...#....", "...#....", "..###...", "..#+##..", ".##+###.", ".#+####.", ".######.", "..####.."],
  },
  stone: {
    color: "#a8946c", light: "#e8dcc0",
    icon: ["..####..", ".#++++#.", "#+####+#", "#+####+#", "#+####+#", "#######.", ".######.", "..####.."],
  },
  gale: {
    color: "#8fd3c8", light: "#f2fff8",
    icon: ["........", ".#####..", "......#.", "..####+.", ".#......", ".#+####.", "......#.", ".#####.."],
  },
};

export function CrestIcon({ crest, size = 16 }: { crest: CrestId; size?: number }) {
  const look = LOOK[crest];
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden className="shrink-0">
      {look.icon.flatMap((row, y) => [...row].map((ch, x) => (ch === "." ? null : (
        <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={ch === "+" ? look.light : look.color} />
      ))))}
    </svg>
  );
}

/** Re-render when the window (and so the board) changes size. */
function useRelayout(): void {
  const [, set] = useState(0);
  useEffect(() => {
    const bump = () => requestAnimationFrame(() => set((n) => n + 1));
    window.addEventListener("resize", bump);
    const off = onLayout(bump);
    bump();
    return () => { window.removeEventListener("resize", bump); off(); };
  }, []);
}

function Tip({ st, mine, below, grow }: { st: CrestStatus; mine: boolean; below: boolean; grow: number }) {
  // The button may be shrunk to fit the board; the tip keeps the normal HUD size.
  const style = { transform: grow !== 1 ? `scale(${grow})` : undefined, transformOrigin: below ? "top right" : "bottom right" };
  return (
    <div style={style} className={`crest-tip panel p-2 w-[240px] absolute right-0 ${below ? "top-full mt-2" : "bottom-full mb-2"} pointer-events-none`}>
      <div className="flex items-center gap-1.5">
        <CrestIcon crest={st.crest} size={16} />
        <span className="font-pixel text-[11px]" style={{ color: LOOK[st.crest].color }}>{st.name} crest</span>
        {!mine ? <span className="text-[13px] opacity-70">(rival)</span> : null}
      </div>
      <div className="text-[16px] leading-tight mt-1">{st.text}</div>
      <div className="text-[14px] opacity-75 mt-0.5">Costs {CREST_COST} Sigils · once per turn</div>
      {mine && st.reason ? <div className="text-[15px] text-target leading-tight mt-1">Can't use: {st.reason}</div>
        : mine && st.usable ? <div className="text-[15px] text-gold leading-tight mt-1">Click (or C) to use</div>
        : !mine && st.used ? <div className="text-[15px] opacity-80 mt-1">Used this turn</div> : null}
    </div>
  );
}

/** One side's Crest, pinned beside its LP plaque on the board. */
function CrestBadge({ side }: { side: "me" | "opp" }) {
  const { ui, actions } = useGame();
  const update = useStore(ui.duel, (d) => d.update);
  const focused = useStore(ui.duel, (d) => side === "me" && d.focus?.area === "crest");
  const pick = useStore(ui.duel, (d) => (side === "me" ? d.crestPick : null));
  const flash = useStore(ui.duel, (d) => (d.crestFlash?.side === side ? d.crestFlash : null));
  const [hover, setHover] = useState(false);
  // The button's own width, so it can shrink to fit the board's side column on a small window.
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => { const el = box.current; if (el && el.offsetWidth !== w) setW(el.offsetWidth); });
  useRelayout();
  if (!update) return null;
  const s = update.view.state, me: PlayerId = update.view.you;
  if (s.step === "mulligan") return null;
  const p: PlayerId = side === "me" ? me : me === 0 ? 1 : 0;
  const st = crestStatus(s, p, me, update.legal);
  const plaque = actions.boardRect(`lp:${side}`);
  if (!plaque) return null;
  // The LP plaque is 36 board pixels wide in a 62-pixel side column: stay inside the column.
  const room = (plaque.width * 60) / 36;
  const u = w ? Math.min(uiScale(), room / w) : uiScale();
  const mine = side === "me";
  const look = LOOK[st.crest];
  // Yours sits just above your LP plaque, the rival's just below theirs; both right-aligned with the plaque.
  const style: React.CSSProperties = mine
    ? { right: window.innerWidth - plaque.right, bottom: window.innerHeight - plaque.top + 4 * u, transformOrigin: "bottom right" }
    : { right: window.innerWidth - plaque.right, top: plaque.bottom + 4 * u, transformOrigin: "top right" };
  const state = !mine ? "rival" : pick ? "picking" : st.usable ? "ready" : "off";
  const label = mine
    ? `${st.name} crest: ${st.text} Costs ${CREST_COST} Sigils, once per turn.${st.reason ? ` Can't use: ${st.reason}.` : ""}`
    : `Rival's ${st.name} crest: ${st.text}`;
  return (
    <div className="fixed z-[7]" data-zone={mine ? "crest" : undefined} style={{ ...style, transform: `scale(${u})` }}>
      <div ref={box} className="relative" onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
        {mine ? (
          <button
            className={`crest-btn crest-${state} ${focused ? "focus-ring" : ""} ${flash ? "crest-flash" : ""}`}
            style={{ "--crest": look.color, "--crest-light": look.light } as React.CSSProperties}
            aria-label={label}
            aria-disabled={!st.usable && !pick}
            onClick={() => actions.useCrest()}
            onFocus={() => setHover(true)}
            onBlur={() => setHover(false)}
          >
            <CrestIcon crest={st.crest} size={18} />
            <span className="crest-name">{pick ? "Cancel" : st.name}</span>
            <span className="crest-cost" title={`${CREST_COST} Sigils`}>{CREST_COST}<span className="crest-gem" /></span>
            <span className="crest-key">C</span>
            {st.used ? <span className="crest-used">USED</span> : null}
          </button>
        ) : (
          <div
            className={`crest-btn crest-rival ${flash ? "crest-flash" : ""}`}
            style={{ "--crest": look.color, "--crest-light": look.light } as React.CSSProperties}
            aria-label={label}
          >
            <CrestIcon crest={st.crest} size={14} />
            <span className="crest-name">{st.name}</span>
            {st.used ? <span className="crest-used">USED</span> : null}
          </div>
        )}
        {(hover || focused) && !pick && !flash ? <Tip st={st} mine={mine} below={!mine} grow={uiScale() / u} /> : null}
        {flash ? (
          <div key={flash.n} style={{ transform: `scale(${uiScale() / u})`, transformOrigin: mine ? "bottom right" : "top right" }} className={`crest-caption absolute right-0 ${mine ? "bottom-full mb-2" : "top-full mt-2"} pointer-events-none`}>
            {flash.text}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** While picking the Crest's target: what to do, in a strip at the top (so nothing covers the glowing monsters). */
function PickHint() {
  const { ui } = useGame();
  const pick = useStore(ui.duel, (d) => d.crestPick);
  const update = useStore(ui.duel, (d) => d.update);
  if (!pick || !update) return null;
  const st = crestStatus(update.view.state, update.view.you, update.view.you, update.legal);
  const what = pick.from !== null ? "click where it goes" : st.target === "move" ? "click a glowing monster to move" : "click a glowing monster";
  return (
    <div className="absolute top-[calc(var(--top-h)+8px)] inset-x-0 flex justify-center z-40 pointer-events-none">
      <div className="u-t"><div className="panel px-3 py-1 text-[17px] pop-in flex items-center gap-2">
        <CrestIcon crest={st.crest} size={16} />
        <span><span className="text-gold">{st.name} crest ({CREST_SHORT[st.crest]}):</span> {what} · ←/→ Space · Esc or click elsewhere cancels</span>
      </div></div>
    </div>
  );
}

export function CrestBadges() {
  return (
    <>
      <CrestBadge side="me" />
      <CrestBadge side="opp" />
      <PickHint />
    </>
  );
}
