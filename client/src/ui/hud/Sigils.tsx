import { useMemo } from "react";
import { dataUrl, sigilCanvas } from "../../gfx/sprites.js";

export function Sigils(props: { total: number; untapped: number }) {
  const on = useMemo(() => dataUrl(sigilCanvas(false)), []);
  const off = useMemo(() => dataUrl(sigilCanvas(true)), []);
  return (
    <div className="flex items-center gap-[3px]" title={`${props.untapped} of ${props.total} Sigils untapped`}>
      {Array.from({ length: props.total }, (_, i) => (
        <img key={i} src={i < props.untapped ? on : off} className="pixel" style={{ width: 14, height: 18 }} alt="" />
      ))}
      {props.total === 0 ? <span className="text-[14px] opacity-60">no Sigils</span> : null}
    </div>
  );
}
