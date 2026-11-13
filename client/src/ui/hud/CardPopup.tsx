import { useGame } from "../context.js";
import type { PopupSrc } from "../state.js";
import { useStore } from "../useStore.js";
import { cardInfo } from "./cardInfo.js";
import { CardFace, KeywordList } from "./CardFace.js";
import { anchorOf, Floating } from "./Floating.js";

/**
 * A card shown big for reading, next to where it is (not in a fixed panel): its full text with keyword tooltips,
 * live numbers, status notes and every keyword's meaning. Choices live in the action menu, not here.
 */
export function CardPopup({ src, where }: { src: PopupSrc; where: "duel" | "app" }) {
  const { ui, actions } = useGame();
  const update = useStore(ui.duel, (d) => d.update);
  const inDuel = where === "duel" && !!update;
  const info = cardInfo(src, inDuel ? update?.view.state : null, update?.view.you ?? 0);
  if (!info) return null;
  const close = () => (inDuel ? actions.inspect(null) : actions.closePopup());
  const anchor = inDuel ? anchorOf(src, actions) : null;
  return (
    <div className={`fixed inset-0 z-[45] ${inDuel ? "" : "bg-ink/60"}`} onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <Floating anchor={anchor} mode={src.kind === "hand" ? "above" : "side"} z={46} className="pop-in">
        <div className="flex gap-3 items-start" onPointerDown={(e) => e.stopPropagation()}>
          <CardFace id={info.id} size="big" atk={info.atk} def={info.def} damage={info.damage} />
          <div className="panel p-3 flex flex-col gap-2 w-[260px]">
            {info.notes.length ? <div className="text-[16px] leading-tight">{info.notes.join(" · ")}</div> : null}
            <KeywordList keys={info.keys} />
            {!info.keys.length && !info.notes.length ? <div className="text-[16px] opacity-75">No keywords.</div> : null}
            <button className="btn self-end" onClick={close}>Close (Esc)</button>
          </div>
        </div>
      </Floating>
    </div>
  );
}
