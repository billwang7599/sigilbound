import { card } from "@sigilbound/engine";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { KEYWORDS, splitKeywords } from "../../core/keywords.js";
import { CARD_LAYOUT, frameColors, type R } from "../../gfx/frames.js";
import { artCanvas, badgeCanvas, cardBackCanvas, cardBackOf, cardCanvas, dataUrl } from "../../gfx/sprites.js";
import { CardFx } from "./CardFx.js";
import { uiScale } from "../layout.js";

const KIND_LABEL: Record<string, string> = {
  monster: "Monster", quick: "Quick spell", prepared: "Prepared spell", ambush: "Ambush", hidden: "",
};

export function useArt(id: string): string {
  return useMemo(() => dataUrl(id === "hidden" ? cardBackCanvas() : artCanvas(id)), [id]);
}

export function frameColor(id: string): string {
  return frameColors(card(id)).frame;
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
  const u = uiScale();
  const W = 250 * u;
  const left = Math.max(6, Math.min(window.innerWidth - W - 6, at.left + at.width / 2 - W / 2));
  const above = at.top > 140 * u;
  const style: React.CSSProperties = above
    ? { left, bottom: window.innerHeight - at.top + 6, width: W }
    : { left, top: at.bottom + 6, width: W };
  return createPortal(
    <span className="kw-tip" role="tooltip" style={{ ...style, fontSize: 17 * u, padding: `${10 * u}px ${12 * u}px` }}>
      <span className="font-pixel text-gold block mb-0.5" style={{ fontSize: 10 * u }}>{name}</span>
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

/** The name's font size at this scale, shrunk (never below the default) so long names fit their bar. */
function nameSize(name: string, base: number, f: number, width: number): number {
  return Math.max(base, Math.min(Math.round(base * f), Math.floor(width / (name.length * 0.86))));
}

const at = (r: R, s: number): React.CSSProperties => ({ position: "absolute", left: r.x * s, top: r.y * s, width: r.w * s, height: r.h * s });

/**
 * A card as the HUD draws it: a pixel card face (gfx/frames.ts) scaled by a whole number, with crisp DOM text laid
 * over the face's rects so text, costs and ATK/DEF never blur.
 */
export function CardFace(props: {
  id: string;
  size?: "hand" | "big" | "mini";
  atk?: number;
  def?: number;
  damage?: number;
  /** CSS pixels per card pixel, overriding the size's default (a whole number keeps the pixel face crisp). */
  scale?: number;
}) {
  const { id, size = "hand" } = props;
  const def = card(id);
  const L = CARD_LAYOUT[size];
  const s = props.scale ?? L.scale;
  // Text grows with the face; `px(n)` is a font size given at the size's default scale.
  const f = s / L.scale;
  const px = (n: number): React.CSSProperties => ({ fontSize: Math.round(n * f) });
  // Rules text grows a bit slower than the face, so a bigger card shows more lines instead of the same two, larger.
  const textPx = Math.round((size === "big" ? 20 : 13) * (1 + (f - 1) * 0.6));
  const textLines = L.text ? Math.max(2, Math.floor((L.text.h * s - 4 * f - Math.round(7 * f) - 2) / (textPx * 0.95))) : 2;
  const W = L.w * s, H = L.h * s;
  const face = useMemo(() => dataUrl(id === "hidden" ? cardBackOf(L.w, L.h) : cardCanvas(id, size)), [id, size, L.w, L.h]);
  if (def.kind === "hidden") {
    return <img src={face} className="pixel" style={{ width: W, height: H }} alt="card back" draggable={false} />;
  }
  const big = size === "big";
  const mini = size === "mini";
  const atk = props.atk ?? def.atk, dfn = props.def ?? def.def;
  const kindKey = def.kind === "monster" ? "monster" : def.kind;
  const badges = (["guard", "leap", "rush", "awaken"] as const).filter((b) => b === "awaken" ? !!def.awaken : !!def[b]);
  const shown = dfn - (props.damage ?? 0);
  return (
    <CardFx id={id} size={size === "big" ? "big" : "hand"} enabled={size !== "mini"}>
      <div className="relative text-ink card-face" style={{ width: W, height: H }}>
        <img src={face} className="pixel absolute inset-0" style={{ width: W, height: H }} alt="" draggable={false} />
        {L.cost ? (
          <span className={`absolute font-pixel leading-none text-white flex items-center justify-center`}
            style={{ ...at(L.cost, s), ...px(big ? 15 : mini ? 8 : 10), textShadow: "1px 1px 0 #14121c, -1px 0 0 #14121c, 0 -1px 0 #14121c" }}>{def.cost}</span>
        ) : null}
        {L.name ? (
          <span className={`absolute font-pixel leading-none text-paper truncate flex items-center`}
            style={{ ...at(L.name, s), fontSize: nameSize(def.name, big ? 14 : mini ? 7 : 9, f, L.name.w * s), textShadow: "1px 1px 0 #14121c" }}>{def.name}</span>
        ) : null}
        {L.text && !mini ? (
          <div className={`absolute overflow-hidden ${big ? "leading-[1.02]" : "leading-[0.95]"}`}
            style={{ ...at(L.text, s), fontSize: textPx, padding: big ? `${6 * f}px ${8 * f}px` : `${2 * f}px ${4 * f}px` }}>
            <div className={`font-pixel ${big ? "mb-1" : ""} uppercase flex items-center gap-1`} style={{ color: "#6b4226", ...px(big ? 10 : 7) }}>
              {big ? <Kw k={kindKey}>{KIND_LABEL[def.kind]}</Kw> : KIND_LABEL[def.kind]}
              {def.kind === "monster" ? <span className="opacity-80">· {def.affinity}</span> : null}
              {badges.map((b) => (
                <img key={b} src={dataUrl(badgeCanvas(b))} className="pixel inline-block" style={{ width: (big ? 14 : 7) * f }} alt={b} />
              ))}
            </div>
            <div className={big ? "" : "line-clamp-2"} style={big ? undefined : { WebkitLineClamp: textLines }}>
              {def.text ? <KeywordText text={def.text} tips={!mini} /> : def.kind === "monster" ? "—" : ""}
            </div>
          </div>
        ) : null}
        {def.kind === "monster" && L.atk && L.def ? (
          <>
            <span className="absolute font-pixel leading-none flex items-center justify-center" style={{ ...at(L.atk, s), ...px(big ? 16 : 10), color: "#ffe08a", textShadow: "1px 1px 0 #14121c" }}>
              {big ? <Kw k="atk">{atk}</Kw> : atk}
            </span>
            <span className="absolute font-pixel leading-none flex items-center justify-center" style={{ ...at(L.def, s), ...px(big ? 16 : 10), color: props.damage ? "#ff6b5b" : "#d6f6ff", textShadow: "1px 1px 0 #14121c" }}>
              {big ? <Kw k="def">{shown}</Kw> : shown}
            </span>
          </>
        ) : null}
      </div>
    </CardFx>
  );
}
