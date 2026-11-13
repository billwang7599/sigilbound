import { useEffect, useState } from "react";
import { describeAction } from "../../core/describe.js";
import { useGame } from "../context.js";
import { useStore } from "../useStore.js";
import { CardFace } from "./CardFace.js";

/** The Ambush window: your chance to respond, with the server's countdown. */
export function AmbushPrompt() {
  const { ui, actions } = useGame();
  const update = useStore(ui.duel, (d) => d.update);
  const endsAt = useStore(ui.duel, (d) => d.windowEndsAt);
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    if (!endsAt) return;
    let raf = 0;
    const tick = () => { setNow(performance.now()); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [endsAt]);
  if (!update?.window || !endsAt) return null;
  const me = update.view.you;
  const s = update.view.state;
  const w = s.window;
  if (!w) return null;
  const left = Math.max(0, endsAt - now);
  const share = left / 3000;
  if (w.responder !== me) {
    return (
      <div className="absolute top-24 left-1/2 -translate-x-1/2 panel px-4 py-2 font-pixel text-[11px] pointer-events-none">
        Rival may respond…
      </div>
    );
  }
  const ambushes = update.legal.filter((a) => a.type === "ambush");
  const what = w.kind === "attack"
    ? `Rival attacks ${w.target.kind === "direct" ? "you directly" : "your monster"}!`
    : "Your monster was destroyed in battle!";
  return (
    <div className="absolute inset-x-0 top-20 flex justify-center pointer-events-none">
      <div className="panel p-3 flex flex-col gap-2 pointer-events-auto min-w-[340px]">
        <div className="font-pixel text-[13px] text-gold">Ambush window</div>
        <div>{what}</div>
        <div className="h-3 bg-ink" style={{ boxShadow: "inset 0 0 0 1px #000" }}>
          <div className="h-full bg-hp" style={{ width: `${share * 100}%` }} />
        </div>
        <div className="flex gap-2 items-end">
          {ambushes.map((a) => {
            const c = s.players[me].hand.find((x) => "uid" in a && x.uid === a.uid);
            return (
              <button key={"uid" in a ? a.uid : 0} className="flex flex-col items-center gap-1" onClick={() => actions.act(a)}>
                {c ? <CardFace id={c.id} /> : null}
                <span className="btn btn-gold !text-[9px]">{describeAction(a, s, me)}</span>
              </button>
            );
          })}
          {!ambushes.length ? <span className="opacity-70 text-[15px]">No Ambush you can play here.</span> : null}
          <div className="flex-1" />
          <button className="btn" onClick={() => actions.act({ type: "pass" })}>Pass</button>
        </div>
      </div>
    </div>
  );
}

export function GameOver() {
  const { ui, actions } = useGame();
  const update = useStore(ui.duel, (d) => d.update);
  if (!update || update.view.state.step !== "over") return null;
  const s = update.view.state;
  const won = s.winner === update.view.you;
  return (
    <div className="absolute inset-0 bg-ink/70 flex items-center justify-center">
      <div className="panel p-6 flex flex-col items-center gap-3">
        <div className={`font-pixel text-[28px] ${won ? "text-gold" : "text-hp"}`}>{won ? "Victory!" : "Defeat"}</div>
        <div>{s.endReason === "concede" ? (won ? "The rival conceded." : "You conceded.") : `After ${s.turn} turns.`}</div>
        <div className="flex gap-2">
          <button className="btn btn-gold" onClick={() => actions.newDuel("ember_rush")}>Play Ember Rush</button>
          <button className="btn btn-gold" onClick={() => actions.newDuel("deepwall")}>Play Deepwall</button>
          <button className="btn" onClick={() => actions.leave()}>Menu</button>
        </div>
      </div>
    </div>
  );
}
