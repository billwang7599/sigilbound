import { atkOf, card, defOf, type PlayerId } from "@sigilbound/engine";
import {
  dropKeys, groupByVerb, matches, openDims, optionLabel, optionsFor, resolve, verbLabel, type Dim, type Plan, type Verb,
} from "../../core/intent.js";
import { useGame } from "../context.js";
import type { Popup } from "../state.js";
import { useStore } from "../useStore.js";
import { CardFace } from "./CardFace.js";

const DIM_TITLE: Record<Dim, string> = {
  lane: "Lane", position: "Position", targets: "Return to hand", target: "Target", revive: "Bring back", to: "Where",
};
const DIM_KEYS: Record<Dim, string> = {
  lane: "1/2/3 or ←/→", position: "A/D", targets: "←/→", target: "←/→ or 1-9", revive: "←/→", to: "←/→",
};
const VERB_KEY: Partial<Record<Verb, string>> = { bind: "B", position: "S", attack: "Enter" };

/** A big, readable card with keyword tooltips, plus whatever you can legally do with it. */
export function CardPopup({ popup, where }: { popup: Popup; where: "duel" | "app" }) {
  const { ui, actions } = useGame();
  const update = useStore(ui.duel, (d) => d.update);
  const mulligan = useStore(ui.duel, (d) => d.mulligan);
  const inDuel = where === "duel" && !!update;
  const s = update?.view.state;
  const me = update?.view.you ?? 0;
  const opp: PlayerId = me === 0 ? 1 : 0;

  // The card and its live numbers.
  let id: string | null = null;
  let atk: number | undefined, dfn: number | undefined, damage: number | undefined;
  const notes: string[] = [];
  const src = popup.src;
  if (src.kind === "card") { id = src.id; if (src.note) notes.push(src.note); }
  else if (s) {
    if (src.kind === "hand") {
      id = s.players[me].hand.find((c) => c.uid === src.uid)?.id ?? null;
      if (id && card(id).rush && s.players[me].sigils.length <= 3) {
        atk = card(id).atk + 2;
        notes.push("Rush is on: +2 ATK while you have 3 or fewer Sigils");
      }
    }
    else if (src.kind === "spell") {
      const sp = s.players[me].spells[src.lane];
      id = sp?.id ?? null;
      if (sp) notes.push(sp.setTurn < s.turn ? "Set face down. You can flip it now (free)." : "Set this turn: flip it on a later turn.");
    } else {
      const p: PlayerId = src.kind === "monster" ? me : opp;
      const m = s.players[p].monsters[src.lane];
      if (m) {
        id = m.id;
        atk = atkOf(s, p, src.lane);
        dfn = defOf(s, p, src.lane);
        damage = m.damage;
        notes.push(m.position === "atk" ? "Attack position" : "Defense position");
        if (m.damage) notes.push(`${m.damage} damage this turn`);
        if (m.entered === s.turn) notes.push("entered this turn");
        if (m.attacked) notes.push("has attacked");
        if (m.atkPerm || m.defPerm) notes.push("Awakened");
        if (card(m.id).guard && m.position !== "def") notes.push("Guard is off (attack position)");
      }
    }
  }
  if (!id) return null;
  const def = card(id);

  const groups = inDuel ? groupByVerb(actions.popupPlansOf(popup)) : new Map<Verb, Plan[]>();
  const verbPlans = popup.verb ? groups.get(popup.verb) ?? [] : [];
  const dims = openDims(verbPlans);
  const done = popup.verb ? resolve(verbPlans, popup.picks) : null;
  const mulliganing = inDuel && s?.step === "mulligan" && src.kind === "hand" && !s.players[me].mulliganDone;
  const hintFor = (dim: Dim, value: string) => {
    const fit = verbPlans.filter((p) => matches(p, { ...popup.picks, [dim]: value }));
    return [...new Set(fit.flatMap((p) => dropKeys(p.action, me)))];
  };

  let help = "";
  if (inDuel && src.kind === "hand" && !groups.size && !mulliganing) {
    help = def.kind === "ambush" ? "Play it on the rival's turn, when it attacks."
      : s?.active !== me ? "Wait for your turn." : s.step === "attack" ? "You're in the attack step: cards can't be played now."
      : "You can't afford this yet.";
  }

  return (
    <div className={`absolute inset-0 z-40 flex items-center pop-in ${inDuel ? "justify-start pl-4 bg-ink/35" : "justify-center bg-ink/60"}`} onPointerDown={(e) => { if (e.target === e.currentTarget) actions.closePopup(); }}>
      <div className="flex gap-4 items-start" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-2 items-center">
          <CardFace id={id} size="big" atk={atk} def={dfn} damage={damage} />
          {notes.length ? <div className="panel px-3 py-1.5 max-w-[252px] text-[17px] leading-tight">{notes.join(" · ")}</div> : null}
        </div>
        {inDuel && (groups.size || mulliganing || help) ? (
          <div className="panel p-3 flex flex-col gap-3 w-[300px]">
            {mulliganing && src.kind === "hand" ? (
              <button className="btn" onClick={() => actions.toggleMulligan(src.uid)}>
                {mulligan.includes(src.uid) ? "Keep this card" : "Send back (mulligan)"}
              </button>
            ) : null}
            {help ? <div className="text-[17px] opacity-85">{help}</div> : null}
            {popup.verb && dims.length ? (
              <>
                {dims.map((dim) => {
                  const opts = optionsFor(verbPlans, dim, popup.picks);
                  return (
                    <div key={dim} className="flex flex-col gap-1">
                      <div className="flex justify-between font-pixel text-[10px] text-paper-dark">
                        <span>{DIM_TITLE[dim]}</span><span className="opacity-70">{DIM_KEYS[dim]}</span>
                      </div>
                      <div className={`flex gap-1 ${dim === "position" || dim === "lane" ? "" : "flex-col"}`}>
                        {(dim === "lane" ? ["0", "1", "2"] : opts).map((v) => {
                          const legal = opts.includes(v);
                          const on = popup.picks[dim] === v;
                          return (
                            <button
                              key={v}
                              disabled={!legal}
                              className={`btn flex-1 !text-[10px] ${on ? "btn-gold choice-on" : ""}`}
                              onClick={() => actions.popupPick(dim, v)}
                              onMouseEnter={() => actions.hint(hintFor(dim, v))}
                              onMouseLeave={() => actions.hint(null)}
                              onFocus={() => actions.hint(hintFor(dim, v))}
                              onBlur={() => actions.hint(null)}
                            >
                              {s ? optionLabel(popup.verb!, dim, v, s, me) : v}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <button className={`btn ${done ? "btn-gold" : ""}`} disabled={!done} onClick={() => actions.popupConfirm()}>
                  {verbLabel(popup.verb, verbPlans, s!, me)} <span className="opacity-60">(Enter)</span>
                </button>
              </>
            ) : null}
            {popup.verb && !dims.length && verbPlans.length ? (
              <button className="btn btn-gold" onClick={() => actions.send(verbPlans[0]!, src.kind === "hand" ? src.uid : undefined)}>
                {verbLabel(popup.verb, verbPlans, s!, me)} <span className="opacity-60">(Enter)</span>
              </button>
            ) : null}
            {[...groups.entries()].filter(([v]) => v !== popup.verb).map(([v, plans]) => (
              <button
                key={v}
                className={`btn ${v === "attack" ? "btn-red" : ""}`}
                onClick={() => actions.popupVerb(v)}
                onMouseEnter={() => actions.hint(plans.flatMap((p) => dropKeys(p.action, me)))}
                onMouseLeave={() => actions.hint(null)}
              >
                {s ? verbLabel(v, plans, s, me) : v}
                {VERB_KEY[v] ? <span className="opacity-60"> ({VERB_KEY[v]})</span> : null}
              </button>
            ))}
            <button className="text-[16px] underline opacity-70 self-end" onClick={() => actions.popupBack()}>
              {popup.order.length || (popup.verb && dims.length && popup.verb !== "summon" && popup.verb !== "cast" && popup.verb !== "set" && popup.verb !== "flip") ? "Back (Esc)" : "Cancel (Esc)"}
            </button>
          </div>
        ) : (
          <div className="self-start">
            <button className="btn" onClick={() => actions.closePopup()}>Close (Esc)</button>
          </div>
        )}
      </div>
    </div>
  );
}
