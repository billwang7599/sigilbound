import { card } from "@sigilbound/engine";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { KEYWORDS, splitKeywords } from "../../core/keywords.js";
import { AFFINITY } from "../../gfx/palette.js";
import { artCanvas, cardBackCanvas, dataUrl } from "../../gfx/sprites.js";

const KIND_LABEL: Record<string, string> = {
  monster: "Monster", quick: "Quick spell", prepared: "Prepared spell", ambush: "Ambush", hidden: "",
};

export function useArt(id: string): string {
  return useMemo(() => dataUrl(id === "hidden" ? cardBackCanvas() : artCanvas(id)), [id]);
}

export function frameColor(id: string): string {
  const def = card(id);
  return def.kind === "monster" ? AFFINITY[def.affinity].frame : def.kind === "ambush" ? "#8a3a4a" : def.kind === "prepared" ? "#7a6236" : "#4f6aa0";
}

/**
 * A word with a pixel tooltip explaining it (definitions in core/keywords.ts). The tip is portalled to <body> and
 * kept on screen, so a card's clipped text box or the window edge never cuts it off.
 */
export function Kw({ k, children, className = "kw", tip }: {
  k: string; children: React.ReactNode; className?: string; tip?: { name: string; text: string };
}) {
  const kw = tip ?? KEYWORDS[k];
  const ref = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<DOMRect | null>(null);
  if (!kw) return <>{children}</>;
  const show = () => { if (ref.current) setAt(ref.current.getBoundingClientRect()); };
  const hide = () => setAt(null);
  return (
    <span ref={ref} className={className} tabIndex={0} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {at ? <KwTip name={kw.name} text={kw.text} at={at} /> : null}
    </span>
  );
}

function KwTip({ name, text, at }: { name: string; text: string; at: DOMRect }) {
  const W = 250;
  const left = Math.max(6, Math.min(window.innerWidth - W - 6, at.left + at.width / 2 - W / 2));
  const above = at.top > 140;
  const style: React.CSSProperties = above
    ? { left, bottom: window.innerHeight - at.top + 6, width: W }
    : { left, top: at.bottom + 6, width: W };
  return createPortal(
    <span className="kw-tip" role="tooltip" style={style}>
      <span className="font-pixel text-[10px] text-gold block mb-0.5">{name}</span>
      {text}
    </span>,
    document.body,
  );
}

/** Each keyword on a card with its one-line meaning, so nobody has to hunt for the word. */
export function KeywordList({ keys, hot, className = "" }: { keys: string[]; hot?: string | null; className?: string }) {
  if (!keys.length) return null;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {keys.map((k) => {
        const kw = KEYWORDS[k];
        if (!kw) return null;
        return (
          <div key={k} className={`text-[15px] leading-[1.05] ${hot === k ? "bg-gold/25 outline outline-1 outline-gold" : ""} px-1`}>
            <span className="font-pixel text-[9px] text-gold mr-1 uppercase">{kw.name}</span>{kw.text}
          </div>
        );
      })}
    </div>
  );
}

/** Card text with every keyword underlined and explained on hover. */
export function KeywordText({ text, tips }: { text: string; tips: boolean }) {
  if (!tips) return <>{text}</>;
  return <>{splitKeywords(text).map((p, i) => (p.kw ? <Kw key={i} k={p.kw}>{p.text}</Kw> : <span key={i}>{p.text}</span>))}</>;
}

/** A card as the HUD draws it: a paper card for the hand, or a big readable one for the popup. */
export function CardFace(props: {
  id: string;
  size?: "hand" | "big" | "mini";
  atk?: number;
  def?: number;
  damage?: number;
}) {
  const { id, size = "hand" } = props;
  const def = card(id);
  const art = useArt(id);
  const big = size === "big";
  const mini = size === "mini";
  const W = big ? 252 : mini ? 72 : 100, H = big ? 352 : mini ? 100 : 140;
  if (def.kind === "hidden") {
    return <img src={art} className="pixel" style={{ width: W, height: H }} alt="card back" draggable={false} />;
  }
  const atk = props.atk ?? def.atk, dfn = props.def ?? def.def;
  const kindKey = def.kind === "monster" ? "monster" : def.kind;
  return (
    <div
      className="relative flex flex-col text-ink"
      style={{ width: W, height: H, background: frameColor(id), padding: big ? 8 : 4, boxShadow: "inset 0 0 0 2px #1c1a24, inset 0 0 0 4px #ffffff33" }}
    >
      <div className="flex items-center gap-1">
        <span
          className={`font-pixel ${big ? "text-[16px]" : "text-[11px]"} leading-none text-white flex items-center justify-center shrink-0`}
          style={{ width: big ? 28 : 16, height: big ? 28 : 16, background: "#2a1a4a", boxShadow: "inset 0 0 0 1px #c9a7ff" }}
        >{def.cost}</span>
        <span className={`font-pixel ${big ? "text-[15px]" : mini ? "text-[7px]" : "text-[9px]"} leading-none text-white truncate`} style={{ textShadow: "1px 1px 0 #1c1a24" }}>{def.name}</span>
      </div>
      <div className="mt-1 flex items-center justify-center" style={{ background: "#2a2438", height: big ? 132 : mini ? 34 : 54 }}>
        <img src={art} className="pixel" draggable={false} style={{ width: def.kind === "monster" ? (big ? 120 : mini ? 32 : 48) : (big ? 80 : mini ? 24 : 32) }} alt="" />
      </div>
      {mini ? null : (
        <div className={`paper mt-1 flex-1 ${big ? "px-2.5 py-2 text-[21px] leading-[1.05]" : "px-1.5 py-1 text-[13px] leading-[0.95]"}`}>
          <div className={`font-pixel ${big ? "text-[10px] mb-1" : "text-[8px]"} opacity-75 uppercase`}>
            {big ? <Kw k={kindKey}>{KIND_LABEL[def.kind]}</Kw> : KIND_LABEL[def.kind]}
            {def.kind === "monster" ? ` · ${def.affinity}` : ""}
          </div>
          <div className={big ? "" : "line-clamp-3"}>
            {def.text ? <KeywordText text={def.text} tips={!mini} /> : def.kind === "monster" ? "—" : ""}
          </div>
        </div>
      )}
      {def.kind === "monster" ? (
        <div className={`absolute font-pixel bg-ink px-1 leading-tight ${big ? "bottom-3 right-3 text-[18px]" : mini ? "bottom-1 right-1 text-[9px]" : "bottom-1 right-1 text-[10px]"}`}>
          {big ? (
            <>
              <Kw k="atk"><span className="text-[#ffb35c]">{atk}</span></Kw>
              <span className="text-white">/</span>
              <Kw k="def"><span className={props.damage ? "text-target" : "text-[#9fd3ff]"}>{dfn - (props.damage ?? 0)}</span></Kw>
            </>
          ) : (
            <>
              <span className="text-[#ffb35c]">{atk}</span>
              <span className="text-white">/</span>
              <span className={props.damage ? "text-target" : "text-[#9fd3ff]"}>{dfn - (props.damage ?? 0)}</span>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
