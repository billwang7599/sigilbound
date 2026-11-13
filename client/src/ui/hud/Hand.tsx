import { useGame } from "../context.js";
import { optionsFor } from "../../core/selection.js";
import { useStore } from "../useStore.js";
import { CardFace } from "./CardFace.js";

export function Hand() {
  const { ui, actions } = useGame();
  const update = useStore(ui.duel, (d) => d.update);
  const selection = useStore(ui.duel, (d) => d.selection);
  const mulligan = useStore(ui.duel, (d) => d.mulligan);
  if (!update) return null;
  const s = update.view.state;
  const me = update.view.you;
  const hand = s.players[me].hand;
  const mulliganing = s.step === "mulligan" && !s.players[me].mulliganDone;
  return (
    <div className="h-[158px] shrink-0 flex items-end justify-center gap-2 px-4 pb-2 overflow-x-auto">
      {hand.map((c) => {
        const playable = optionsFor({ kind: "hand", uid: c.uid }, update.legal).length > 0;
        const selected = selection?.kind === "hand" && selection.uid === c.uid;
        const marked = mulligan.includes(c.uid);
        return (
          <button
            key={c.uid}
            className={`shrink-0 transition-transform duration-75 ${selected ? "-translate-y-3" : "hover:-translate-y-1"} ${playable && !selected ? "glow" : ""}`}
            style={{ outline: selected ? "2px solid white" : undefined, opacity: marked ? 0.45 : 1 }}
            onClick={() => (mulliganing ? actions.toggleMulligan(c.uid) : actions.select(selected ? null : { kind: "hand", uid: c.uid }))}
            onMouseEnter={() => actions.hover({ id: c.id })}
            onMouseLeave={() => actions.hover(null)}
          >
            <CardFace id={c.id} />
            {marked ? <div className="font-pixel text-[9px] text-target -mt-4 relative">↺ back</div> : null}
          </button>
        );
      })}
      {!hand.length ? <span className="opacity-50 self-center">Your hand is empty.</span> : null}
    </div>
  );
}
