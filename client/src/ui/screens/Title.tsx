import { GraphicsToggle } from "../hud/GraphicsToggle.js";
import { DECKS, CRESTS, type DeckChoice } from "@sigilbound/engine";
import { useMemo, useState } from "react";
import { titleBackdropCanvas } from "../../gfx/board-art.js";
import { dataUrl } from "../../gfx/sprites.js";
import { Mascot } from "../hud/Mascot.js";
import { useGame } from "../context.js";
import { useStore } from "../useStore.js";

const BLURB: Record<DeckChoice, { mascot: string; plan: string; tone: string }> = {
  ember_rush: { mascot: "blazerunner", tone: "deck-ember", plan: "Aggro. Fill lanes fast, stop binding at 3 Sigils to keep Rush on, finish with Firebolt and Leap." },
  deepwall: { mascot: "abyssal_leviathan", tone: "deck-tide", plan: "Control. Hold the line with Guards, Ambush and removal, then win with big finishers." },
};

function DeckButton({ deck }: { deck: DeckChoice }) {
  const { actions } = useGame();
  const d = DECKS[deck]!;
  const [hot, setHot] = useState(false);
  return (
    <div className="flex flex-col items-center gap-2">
    <button
      className={`deck-pick ${BLURB[deck].tone} paper p-4 w-[300px] flex flex-col items-center gap-2 text-ink`}
      onClick={() => actions.newDuel(deck)}
      onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)} onFocus={() => setHot(true)} onBlur={() => setHot(false)}
    >
      <div className="deck-stage"><Mascot id={BLURB[deck].mascot} size={144} active={hot} /></div>
      <div className="font-pixel text-[14px]">{d.name}</div>
      <div className="text-[16px] leading-tight text-center">{BLURB[deck].plan}</div>
      <div className="text-[14px] opacity-70">Crest: {CRESTS[d.crest].name}</div>
    </button>
    <button className="btn !text-[10px]" onClick={() => actions.showDeckList(deck)}>View deck (30 cards)</button>
    </div>
  );
}

const PARADE = ["cinderpup", "pebblekin", "gustling", "mudling", "ripplefin", "ash_hound"];

export function Title() {
  const { ui, actions } = useGame();
  const backdrop = useMemo(() => dataUrl(titleBackdropCanvas()), []);
  const connected = useStore(ui.app, (a) => a.connected);
  const hasSaved = useStore(ui.app, (a) => a.hasSaved);
  const error = useStore(ui.app, (a) => a.error);
  return (
    <div className="relative h-full flex items-center justify-center bg-night overflow-clip">
    <div className="title-sky" style={{ backgroundImage: `url(${backdrop})` }} />
    <div className="title-parade" aria-hidden>
      {PARADE.map((id, i) => <Mascot key={id} id={id} size={96} delay={i * 170} flip={i >= PARADE.length / 2} />)}
    </div>
    <div className="u-c relative flex flex-col items-center gap-6">
      <div className="flex items-center gap-4">
        <span className="title-gem" />
        <div className="title-logo font-pixel text-[56px] text-gold">SIGILBOUND</div>
        <span className="title-gem" />
      </div>
      <div className="text-[20px] opacity-80">Choose a deck. The AI plays the other one.</div>
      <div className="flex gap-6">
        <DeckButton deck="ember_rush" />
        <DeckButton deck="deepwall" />
      </div>
      {hasSaved ? <button className="btn" onClick={() => actions.resume()}>Continue last duel</button> : null}
      <div className="text-[15px] opacity-60">{connected ? "Connected to the server." : "Connecting to the server…"}</div>
      {error ? <div className="text-hp">{error}</div> : null}
    </div>
      <GraphicsToggle />
    </div>
  );
}
