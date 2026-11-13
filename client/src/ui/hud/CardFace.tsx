import { card } from "@sigilbound/engine";
import { useMemo } from "react";
import { AFFINITY } from "../../gfx/palette.js";
import { artCanvas, cardBackCanvas, dataUrl } from "../../gfx/sprites.js";

const KIND_LABEL: Record<string, string> = {
  monster: "Monster", quick: "Quick spell", prepared: "Prepared spell", ambush: "Ambush", hidden: "",
};

export function useArt(id: string): string {
  return useMemo(() => dataUrl(id === "hidden" ? cardBackCanvas() : artCanvas(id)), [id]);
}

/** A card as the HUD draws it: a small paper card for the hand, a bigger one for the detail panel. */
export function CardFace(props: {
  id: string;
  size?: "hand" | "detail";
  atk?: number;
  def?: number;
  damage?: number;
  note?: string;
}) {
  const { id, size = "hand" } = props;
  const def = card(id);
  const art = useArt(id);
  const big = size === "detail";
  if (def.kind === "hidden") {
    return <img src={art} className="pixel" style={{ width: big ? 160 : 96, height: big ? 200 : 120 }} alt="card back" />;
  }
  const frame = def.kind === "monster" ? AFFINITY[def.affinity].frame : def.kind === "ambush" ? "#8a3a4a" : def.kind === "prepared" ? "#7a6236" : "#4f6aa0";
  const atk = props.atk ?? def.atk, dfn = props.def ?? def.def;
  return (
    <div
      className="relative flex flex-col text-ink"
      style={{
        width: big ? 196 : 100, height: big ? 272 : 140, background: frame, padding: big ? 6 : 4,
        boxShadow: "inset 0 0 0 2px #1c1a24, inset 0 0 0 4px #ffffff33",
      }}
    >
      <div className="flex items-center gap-1">
        <span
          className="font-pixel text-[11px] leading-none text-white flex items-center justify-center shrink-0"
          style={{ width: big ? 20 : 16, height: big ? 20 : 16, background: "#2a1a4a", boxShadow: "inset 0 0 0 1px #c9a7ff" }}
          title="Cost in Sigils"
        >{def.cost}</span>
        <span className={`font-pixel ${big ? "text-[12px]" : "text-[9px]"} leading-none text-white truncate`} style={{ textShadow: "1px 1px 0 #1c1a24" }}>{def.name}</span>
      </div>
      <div className="mt-1 flex items-center justify-center" style={{ background: "#2a2438", height: big ? 104 : 54 }}>
        <img src={art} className="pixel" style={{ width: def.kind === "monster" ? (big ? 96 : 48) : (big ? 64 : 32) }} alt="" />
      </div>
      <div className={`paper mt-1 flex-1 px-1.5 py-1 ${big ? "text-[17px]" : "text-[13px]"} leading-[0.95]`}>
        <div className="font-pixel text-[8px] opacity-70 uppercase">
          {KIND_LABEL[def.kind]}{def.kind === "monster" ? ` · ${def.affinity}` : ""}
        </div>
        <div className={big ? "" : "line-clamp-3"}>{def.text || (def.kind === "monster" ? "—" : "")}</div>
        {big && props.note ? <div className="mt-1 opacity-75">{props.note}</div> : null}
      </div>
      {def.kind === "monster" ? (
        <div className={`absolute ${big ? "bottom-2 right-2 text-[14px]" : "bottom-1 right-1 text-[10px]"} font-pixel bg-ink px-1 leading-tight`}>
          <span className="text-[#ffb35c]">{atk}</span>
          <span className="text-white">/</span>
          <span className={props.damage ? "text-target" : "text-[#9fd3ff]"}>{dfn - (props.damage ?? 0)}</span>
        </div>
      ) : null}
    </div>
  );
}
