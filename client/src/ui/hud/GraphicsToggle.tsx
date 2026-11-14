/** The "Graphics" setting: Off / Low / High (saved; see visuals/shaders/settings.ts). Shown in a screen corner. */
import { useSyncExternalStore } from "react";
import { gfxAutoLowered, gfxChosen, gfxLevel, onGfxChange, setGfxLevel, type GfxLevel } from "../../visuals/shaders/settings.js";

const LEVELS: GfxLevel[] = ["off", "low", "high"];

export function GraphicsToggle() {
  const level = useSyncExternalStore(onGfxChange, gfxLevel);
  const chosen = useSyncExternalStore(onGfxChange, gfxChosen);
  const lowered = gfxAutoLowered();
  return (
    <div className="gfx-toggle flex items-center gap-1" title={lowered ? "Lowered to Low automatically: the frame rate dropped under 50." : "Lighting and card effects"}>
      <span className="font-pixel text-[9px] bg-ink/80 px-1 py-0.5 text-paper">Graphics</span>
      {LEVELS.map((l) => (
        <button key={l} className={`btn !text-[9px] !px-2 !py-1 ${chosen === l ? "btn-gold" : ""}`} onClick={() => setGfxLevel(l)} aria-pressed={chosen === l}>
          {l}{lowered && chosen === l && level !== l ? "*" : ""}
        </button>
      ))}
    </div>
  );
}
