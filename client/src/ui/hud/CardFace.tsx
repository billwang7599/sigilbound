import { card } from "@sigilbound/engine";
import { useMemo } from "react";
import { KEYWORDS, splitKeywords } from "../../core/keywords.js";
import { CARD_LAYOUT, frameColors, type R } from "../../gfx/frames.js";
import { artCanvas, badgeCanvas, cardBackCanvas, cardBackOf, cardCanvas, dataUrl } from "../../gfx/sprites.js";
import { CardFx } from "./CardFx.js";

const KIND_LABEL: Record<string, string> = {
  monster: "Monster", quick: "Quick spell", prepared: "Prepared spell", ambush: "Ambush", hidden: "",
};

export function useArt(id: string): string {
  return useMemo(() => dataUrl(id === "hidden" ? cardBackCanvas() : artCanvas(id)), [id]);
}

export function frameColor(id: string): string {
  return frameColors(card(id)).frame;
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
}) {
  const { id, size = "hand" } = props;
  const def = card(id);
  const L = CARD_LAYOUT[size];
  const s = L.scale;
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
          <span className={`absolute font-pixel leading-none text-white flex items-center justify-center ${big ? "text-[15px]" : mini ? "text-[8px]" : "text-[10px]"}`}
            style={{ ...at(L.cost, s), textShadow: "1px 1px 0 #14121c, -1px 0 0 #14121c, 0 -1px 0 #14121c" }}>{def.cost}</span>
        ) : null}
        {L.name ? (
          <span className={`absolute font-pixel leading-none text-paper truncate flex items-center ${big ? "text-[14px]" : mini ? "text-[7px]" : "text-[9px]"}`}
            style={{ ...at(L.name, s), textShadow: "1px 1px 0 #14121c" }}>{def.name}</span>
        ) : null}
        {L.text && !mini ? (
          <div className={`absolute overflow-hidden ${big ? "px-2 py-1.5 text-[20px] leading-[1.02]" : "px-1 py-0.5 text-[13px] leading-[0.95]"}`} style={at(L.text, s)}>
            <div className={`font-pixel ${big ? "text-[10px] mb-1" : "text-[7px]"} uppercase flex items-center gap-1`} style={{ color: "#6b4226" }}>
              {big ? <Kw k={kindKey}>{KIND_LABEL[def.kind]}</Kw> : KIND_LABEL[def.kind]}
              {def.kind === "monster" ? <span className="opacity-80">· {def.affinity}</span> : null}
              {badges.map((b) => (
                <img key={b} src={dataUrl(badgeCanvas(b))} className="pixel inline-block" style={{ width: big ? 14 : 7 }} alt={b} />
              ))}
            </div>
            <div className={big ? "" : "line-clamp-2"}>
              {def.text ? <KeywordText text={def.text} tips={big} /> : def.kind === "monster" ? "—" : ""}
            </div>
          </div>
        ) : null}
        {def.kind === "monster" && L.atk && L.def ? (
          <>
            <span className={`absolute font-pixel leading-none flex items-center justify-center ${big ? "text-[16px]" : "text-[10px]"}`} style={{ ...at(L.atk, s), color: "#ffe08a", textShadow: "1px 1px 0 #14121c" }}>
              {big ? <Kw k="atk">{atk}</Kw> : atk}
            </span>
            <span className={`absolute font-pixel leading-none flex items-center justify-center ${big ? "text-[16px]" : "text-[10px]"}`} style={{ ...at(L.def, s), color: props.damage ? "#ff6b5b" : "#d6f6ff", textShadow: "1px 1px 0 #14121c" }}>
              {big ? <Kw k="def">{shown}</Kw> : shown}
            </span>
          </>
        ) : null}
      </div>
    </CardFx>
  );
}
