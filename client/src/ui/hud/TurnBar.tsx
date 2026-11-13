import { CRESTS } from "@sigilbound/engine";
import { useGame } from "../context.js";
import { useStore } from "../useStore.js";

/** Phase, hints and the buttons that aren't tied to one card. */
export function TurnBar() {
  const { ui, actions } = useGame();
  const update = useStore(ui.duel, (d) => d.update);
  const mulligan = useStore(ui.duel, (d) => d.mulligan);
  if (!update) return null;
  const s = update.view.state;
  const me = update.view.you;
  const legal = update.legal;
  const can = (t: string) => legal.find((a) => a.type === t);
  const tideCrest = legal.find((a) => a.type === "crest" && a.lane === undefined);
  const pl = s.players[me];

  let phase: string;
  if (s.step === "over") phase = "Duel over";
  else if (s.step === "mulligan") phase = pl.mulliganDone ? "Waiting for the rival's mulligan…" : "Mulligan: click cards to send back, then confirm";
  else if (s.window) phase = s.window.responder === me ? "Ambush window!" : "Rival may Ambush…";
  else if (s.active !== me) phase = `Rival's turn (${s.step === "attack" ? "attacking" : "main"})`;
  else if (s.step === "attack") phase = "Attack: pick a monster, then its target";
  else phase = s.turn === 1 ? "Main (no attacks on the first turn)" : "Main: click a card or monster";

  const hint = s.active === me && s.step === "main" && !pl.bound
    ? "Rest draw: if you don't bind this turn, you draw 1 extra card at the end."
    : s.active === me && s.step === "main" ? `Crest: ${CRESTS[pl.crest].text}` : "";

  return (
    <div className="mx-2 mb-1 flex items-center gap-3 px-2">
      <div className="flex flex-col leading-none">
        <span className="font-pixel text-[11px] text-gold">Turn {s.turn} · {phase}</span>
        <span className="text-[14px] opacity-70">{hint}</span>
      </div>
      <div className="flex-1" />
      {s.step === "mulligan" && !pl.mulliganDone ? (
        <button className="btn btn-gold" onClick={() => actions.act({ type: "mulligan", uids: mulligan })}>
          {mulligan.length ? `Mulligan ${mulligan.length}` : "Keep hand"}
        </button>
      ) : null}
      {tideCrest ? <button className="btn" onClick={() => actions.act(tideCrest)}>Tide crest (+2 LP)</button> : null}
      {can("attackStep") ? <button className="btn btn-red" onClick={() => actions.act({ type: "attackStep" })}>Attack ⚔</button> : null}
      {can("endTurn") ? <button className="btn" onClick={() => actions.act({ type: "endTurn" })}>End turn</button> : null}
    </div>
  );
}
