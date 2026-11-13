import { card, type PlayerId } from "@sigilbound/engine";
import {
  dropKeys, groupByVerb, matches, openDims, optionLabel, optionsFor, resolve, verbLabel, type Dim, type Plan, type Verb,
} from "../../core/intent.js";
import { KEYWORDS } from "../../core/keywords.js";
import { useGame } from "../context.js";
import type { Popup } from "../state.js";
import { useStore } from "../useStore.js";
import { cardInfo } from "./cardInfo.js";
import { Kw } from "./CardFace.js";
import { anchorOf, Floating } from "./Floating.js";

const BOARD_DIMS: Dim[] = ["lane", "target", "to"];
const DIM_TITLE: Record<Dim, string> = {
  lane: "Lane", position: "Position", targets: "Return to hand", target: "Target", revive: "Bring back", to: "Where",
};
const VERB_KEY: Partial<Record<Verb, string>> = { bind: "B", position: "S", attack: "A", move: "M", crest: "C" };

/** What to tell the player when the next choice is a place on the board. */
function boardHint(verb: Verb, dim: Dim): string {
  if (verb === "attack") return "Click a red target (1–3, or ←/→ then Enter)";
  if (verb === "summon") return "Click a glowing lane (1/2/3)";
  if (verb === "set") return "Click a glowing spell slot (1/2/3)";
  if (verb === "move" || verb === "crest") return dim === "to" ? "Click a glowing lane" : "Pick on the board";
  return "Click a glowing target (←/→, Enter)";
}

/**
 * The selected card's choices, in a small menu right beside it (beside the lifted hand card, so the board stays
 * clear, or next to a board card). Places
 * are picked on the board itself: they glow, and a click (or 1/2/3) picks one.
 */
export function ActionMenu({ popup }: { popup: Popup }) {
  const { ui, actions } = useGame();
  const update = useStore(ui.duel, (d) => d.update);
  if (!update) return null;
  const s = update.view.state;
  const me: PlayerId = update.view.you;
  const src = popup.src;
  const info = cardInfo(src, s, me);
  if (!info) return null;
  const def = card(info.id);
  const groups = groupByVerb(actions.popupPlansOf(popup));
  const verbPlans: Plan[] = popup.verb ? groups.get(popup.verb) ?? [] : [];
  const dims = openDims(verbPlans);
  const boardDim = dims.find((d) => BOARD_DIMS.includes(d) && popup.picks[d] === undefined);
  const otherDims = boardDim ? [] : dims.filter((d) => !BOARD_DIMS.includes(d));
  const done = popup.verb ? resolve(verbPlans, popup.picks) : null;
  const uid = src.kind === "hand" ? src.uid : undefined;
  const hintFor = (dim: Dim, value: string) =>
    [...new Set(verbPlans.filter((p) => matches(p, { ...popup.picks, [dim]: value })).flatMap((p) => dropKeys(p.action, me)))];

  let help = "";
  if (!groups.size) {
    help = src.kind !== "hand" ? (s.active !== me ? "Wait for your turn." : "Nothing to do with it right now.")
      : def.kind === "ambush" ? "Play it on the rival's turn, when it attacks."
      : s.active !== me ? "Wait for your turn." : s.step === "attack" ? "Attack step: cards can't be played now."
      : "You can't afford this yet.";
  }
  if (!help && src.kind === "hand" && s.active === me && s.step === "main" && [...groups.keys()].every((v) => v === "bind")) {
    const ready = s.players[me].sigils.filter((g) => !g.tapped).length;
    help = def.kind === "ambush" ? "Ambushes are played on the rival's turn."
      : ready < def.cost ? `Costs ${def.cost} Sigil${def.cost === 1 ? "" : "s"}; you have ${ready} untapped.`
      : def.kind === "prepared" ? "No empty spell slot for it." : "Nothing it can target right now.";
  }
  const others = [...groups.entries()].filter(([v]) => v !== popup.verb);
  // A selected monster: attacks and moves glow on the board right away.
  const monsterHint = src.kind === "monster" && !popup.verb && (groups.has("attack") || groups.has("move"))
    ? groups.has("attack") ? "Click a red target to attack" : "Click a glowing lane to move" : "";

  return (
    <Floating anchor={anchorOf(src, actions)} mode="side" z={36} className="pop-in">
      <div className="panel p-2 flex flex-col gap-1.5 w-[232px]" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <span className="font-pixel text-[11px] text-paper truncate flex-1">{def.name}</span>
          {info.atk !== undefined || def.kind === "monster" ? (
            <span className="font-pixel text-[10px] stat-plate px-1">
              <Kw k="atk"><span className="text-atk">{info.atk ?? def.atk}</span></Kw>/<Kw k="def"><span className="text-def">{(info.def ?? def.def) - (info.damage ?? 0)}</span></Kw>
            </span>
          ) : null}
        </div>
        {info.keys.length ? (
          <div className="flex flex-wrap gap-1">
            {info.keys.map((k) => <Kw key={k} k={k} className="kw-chip">{KEYWORDS[k]?.name ?? k}</Kw>)}
          </div>
        ) : null}
        {help ? <div className="text-[16px] leading-tight opacity-85">{help}</div> : null}
        {monsterHint ? <div className="text-[16px] leading-tight text-gold">{monsterHint}</div> : null}
        {popup.verb && boardDim ? (
          <div className="text-[16px] leading-tight text-gold">
            {verbLabel(popup.verb, verbPlans, s, me)}: {boardHint(popup.verb, boardDim)}
          </div>
        ) : null}
        {popup.verb && otherDims.map((dim) => {
          const opts = optionsFor(verbPlans, dim, popup.picks);
          return (
            <div key={dim} className="flex flex-col gap-1">
              <div className="font-pixel text-[9px] text-paper-dark">{DIM_TITLE[dim]}{dim === "position" ? " (A/D)" : " (←/→ or 1–9)"}</div>
              <div className={`flex gap-1 ${dim === "position" ? "" : "flex-col"}`}>
                {opts.map((v) => (
                  <button
                    key={v}
                    className={`btn flex-1 !text-[9px] !px-1.5 !py-1 ${popup.picks[dim] === v ? "btn-gold choice-on" : ""}`}
                    onClick={() => actions.popupPick(dim, v)}
                    onMouseEnter={() => actions.hint(hintFor(dim, v))}
                    onMouseLeave={() => actions.hint(null)}
                  >
                    {optionLabel(popup.verb!, dim, v, s, me)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {popup.verb && !boardDim && (otherDims.length ? done : verbPlans.length) ? (
          <button
            className="btn btn-gold !text-[10px]"
            disabled={otherDims.length > 0 && !done}
            onClick={() => (done ? actions.popupConfirm() : actions.send(verbPlans[0]!, uid))}
          >
            {verbLabel(popup.verb, verbPlans, s, me)} <span className="opacity-60">(Enter)</span>
          </button>
        ) : null}
        {others.length ? (
          <div className="flex flex-col gap-1">
            {others.map(([v, plans]) => (
              <button
                key={v}
                className={`btn !text-[10px] !py-1 ${v === "attack" ? "btn-red" : ""}`}
                onClick={() => actions.popupVerb(v)}
                onMouseEnter={() => actions.hint(plans.flatMap((p) => dropKeys(p.action, me)))}
                onMouseLeave={() => actions.hint(null)}
              >
                {verbLabel(v, plans, s, me)}
                {VERB_KEY[v] ? <span className="opacity-60"> ({VERB_KEY[v]})</span> : null}
                {v === "bind" ? <span className="block text-[8px] opacity-70 normal-case">or click your Sigil row</span> : null}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex justify-between items-center text-[15px]">
          <button className="underline opacity-80" onClick={() => actions.inspect(src)}>Read card (I)</button>
          <button className="underline opacity-80" onClick={() => actions.popupBack()}>
            {popup.order.length ? "Back" : "Cancel"} (Esc)
          </button>
        </div>
      </div>
    </Floating>
  );
}
