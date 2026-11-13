import { card } from "@sigilbound/engine";
import { useMemo } from "react";
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

/** A word with a pixel tooltip explaining it (definitions in core/keywords.ts). */
export function Kw({ k, children }: { k: string; children: React.ReactNode }) {
  const kw = KEYWORDS[k];
  if (!kw) return <>{children}</>;
  return (
    <span className="kw" tabIndex={0}>
      {children}
      <span className="kw-tip" role="tooltip">
        <span className="font-pixel text-[10px] text-gold block mb-0.5">{kw.name}</span>
        {kw.text}
      </span>
    </span>
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
            {def.text ? <KeywordText text={def.text} tips={big} /> : def.kind === "monster" ? "—" : ""}
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
