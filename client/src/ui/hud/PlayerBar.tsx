import { CRESTS, FIELDS, untapped, type PlayerId } from "@sigilbound/engine";
import { slotKey } from "../../core/selection.js";
import { useGame } from "../context.js";
import { useStore } from "../useStore.js";
import { Sigils } from "./Sigils.js";
import { useArt } from "./CardFace.js";

const FACE = slotKey({ side: "opp", row: "face", lane: -1 });

function Lp({ lp }: { lp: number }) {
  return (
    <div key={lp} className="flex items-baseline gap-1 shake">
      <span className="font-pixel text-[10px] text-paper-dark">LP</span>
      <span className={`font-pixel text-[26px] leading-none ${lp <= 5 ? "text-hp" : "text-paper"}`}>{lp}</span>
    </div>
  );
}

function Pile({ label, n, title }: { label: string; n: number; title?: string }) {
  return (
    <div className="flex flex-col items-center leading-none" title={title}>
      <span className="font-pixel text-[13px]">{n}</span>
      <span className="text-[13px] opacity-70">{label}</span>
    </div>
  );
}

export function PlayerBar({ side }: { side: "me" | "opp" }) {
  const { ui, actions } = useGame();
  const update = useStore(ui.duel, (d) => d.update);
  const selection = useStore(ui.duel, (d) => d.selection);
  const back = useArt("hidden");
  if (!update) return null;
  const s = update.view.state;
  const me = update.view.you;
  const p: PlayerId = side === "me" ? me : me === 0 ? 1 : 0;
  const pl = s.players[p];
  const active = s.active === p && s.step !== "mulligan" && s.step !== "over";
  // Clicking the rival is a direct attack, when one is on offer.
  const faceTarget = side === "opp" && !!selection && update.legal.some((a) => a.type === "attack" && a.target.kind === "direct" &&
    selection.kind === "monster" && a.lane === selection.lane);
  const crest = CRESTS[pl.crest];
  return (
    <div
      className={`panel mx-2 ${side === "opp" ? "mt-2" : "mb-1"} flex items-center gap-4 px-4 py-2 ${faceTarget ? "glow cursor-pointer" : ""}`}
      onClick={faceTarget ? () => actions.clickSlot({ side: "opp", row: "face", lane: -1 }) : undefined}
      data-slot={side === "opp" ? FACE : undefined}
    >
      <div className="flex flex-col leading-none min-w-[132px]">
        <span className="font-pixel text-[12px] text-gold">{side === "me" ? "You" : "Rival (AI)"}</span>
        <span className="text-[14px] opacity-80 truncate">{pl.deckName}</span>
      </div>
      <Lp lp={pl.lp} />
      <Sigils total={pl.sigils.length} untapped={untapped(s, p)} />
      <div className="flex-1" />
      {side === "opp" ? (
        <div className="flex items-center gap-[2px]" title={`${pl.hand.length} cards in hand`}>
          {pl.hand.map((c) => <img key={c.uid} src={back} className="pixel" style={{ width: 16, height: 20 }} alt="" />)}
        </div>
      ) : null}
      <Pile label="deck" n={pl.deck.length} />
      <Pile label="discard" n={pl.discard.length} title={pl.discard.map((c) => c.id).join(", ")} />
      <div className="flex flex-col leading-none text-right" title={`${crest.name} crest: ${crest.text} (2 Sigils, once per turn)\nHome: ${FIELDS[pl.home].name}`}>
        <span className="font-pixel text-[10px] text-arcane">{crest.name} crest{pl.crestUsed && active ? " ✓" : ""}</span>
        <span className="text-[13px] opacity-70">{active ? (pl.bound ? "bound this turn" : "not bound yet") : FIELDS[pl.home].name}</span>
      </div>
      {active ? <span className="font-pixel text-[10px] bg-gold text-ink px-2 py-1">TURN</span> : null}
    </div>
  );
}
