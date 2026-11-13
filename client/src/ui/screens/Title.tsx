import { DECKS, FIELDS, CRESTS, type DeckChoice } from "@sigilbound/engine";
import { useMemo } from "react";
import { dataUrl, monsterCanvas } from "../../gfx/sprites.js";
import { useGame } from "../context.js";
import { useStore } from "../useStore.js";

const BLURB: Record<DeckChoice, { mascot: string; plan: string }> = {
  ember_rush: { mascot: "blazerunner", plan: "Aggro. Fill lanes fast, stop binding at 3 Sigils to keep Rush on, finish with Firebolt and Leap." },
  deepwall: { mascot: "abyssal_leviathan", plan: "Control. Hold the line with Guards, Ambush and removal, then win with big finishers." },
};

function DeckButton({ deck }: { deck: DeckChoice }) {
  const { actions } = useGame();
  const d = DECKS[deck]!;
  const art = useMemo(() => dataUrl(monsterCanvas(BLURB[deck].mascot)), [deck]);
  return (
    <button className="paper p-4 w-[300px] flex flex-col items-center gap-2 hover:-translate-y-1 transition-transform text-ink" onClick={() => actions.newDuel(deck)}>
      <img src={art} className="pixel" style={{ width: 96 }} alt="" />
      <div className="font-pixel text-[14px]">{d.name}</div>
      <div className="text-[16px] leading-tight text-center">{BLURB[deck].plan}</div>
      <div className="text-[14px] opacity-70">Home: {FIELDS[d.home].name} · Crest: {CRESTS[d.crest].name}</div>
    </button>
  );
}

export function Title() {
  const { ui, actions } = useGame();
  const connected = useStore(ui.app, (a) => a.connected);
  const hasSaved = useStore(ui.app, (a) => a.hasSaved);
  const error = useStore(ui.app, (a) => a.error);
  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 bg-night">
      <div className="font-pixel text-[48px] text-gold" style={{ textShadow: "4px 4px 0 #4a2e18" }}>SIGILBOUND</div>
      <div className="text-[20px] opacity-80">Choose a deck. The AI plays the other one.</div>
      <div className="flex gap-6">
        <DeckButton deck="ember_rush" />
        <DeckButton deck="deepwall" />
      </div>
      {hasSaved ? <button className="btn" onClick={() => actions.resume()}>Continue last duel</button> : null}
      <div className="text-[15px] opacity-60">{connected ? "Connected to the server." : "Connecting to the server…"}</div>
      {error ? <div className="text-hp">{error}</div> : null}
    </div>
  );
}
