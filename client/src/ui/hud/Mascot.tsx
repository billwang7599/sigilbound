/** A monster sprite that breathes through its idle frames (and lunges on hover, if asked). */
import { useEffect, useMemo, useState } from "react";
import { dataUrl, monsterPose } from "../../gfx/sprites.js";

const FRAMES = ["idle0", "idle1", "idle2", "idle3"] as const;
const HOLD = [380, 180, 400, 240];

export function Mascot({ id, size, active = false, flip = false, delay = 0 }: { id: string; size: number; active?: boolean; flip?: boolean; delay?: number }) {
  const [f, setF] = useState(0);
  useEffect(() => {
    let i = 0, t = 0;
    const tick = () => { i = (i + 1) % 4; setF(i); t = window.setTimeout(tick, HOLD[i]); };
    t = window.setTimeout(tick, HOLD[0]! + delay);
    return () => clearTimeout(t);
  }, [delay]);
  const pose = active ? "attack" : FRAMES[f]!;
  const url = useMemo(() => dataUrl(monsterPose(id, pose)), [id, pose]);
  return <img src={url} className="pixel" style={{ width: size, height: size, transform: flip ? "scaleX(-1)" : undefined }} alt="" draggable={false} />;
}
