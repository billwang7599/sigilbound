import { atkOf, card, defOf, type PlayerId } from "@sigilbound/engine";
import { useEffect, useRef } from "react";
import { describeAction } from "../../core/describe.js";
import { optionsFor } from "../../core/selection.js";
import { useGame } from "../context.js";
import type { Hovered } from "../state.js";
import { useStore } from "../useStore.js";
import { CardFace } from "./CardFace.js";

function Detail() {
  const { ui } = useGame();
  const update = useStore(ui.duel, (d) => d.update);
  const hovered = useStore(ui.duel, (d) => d.hovered);
  const selection = useStore(ui.duel, (d) => d.selection);
  if (!update) return null;
  const s = update.view.state;
  const me = update.view.you;
  let h: Hovered | null = hovered;
  if (!h && selection) {
    if (selection.kind === "hand") {
      const c = s.players[me].hand.find((x) => x.uid === selection.uid);
      if (c) h = { id: c.id };
    } else if (selection.kind === "monster") {
      const m = s.players[me].monsters[selection.lane];
      if (m) h = { id: m.id, side: "me", lane: selection.lane };
    } else {
      const sp = s.players[me].spells[selection.lane];
      if (sp) h = { id: sp.id };
    }
  }
  if (!h) {
    return <div className="h-[272px] flex items-center justify-center text-center opacity-50 px-6">Hover a card to read it.</div>;
  }
  let atk: number | undefined, dfn: number | undefined, damage: number | undefined, note: string | undefined;
  if (h.side && h.lane !== undefined) {
    const p: PlayerId = h.side === "me" ? me : me === 0 ? 1 : 0;
    const m = s.players[p].monsters[h.lane];
    if (m) {
      atk = atkOf(s, p, h.lane);
      dfn = defOf(s, p, h.lane);
      damage = m.damage;
      const bits = [m.position === "atk" ? "Attack position" : "Defense position"];
      if (m.damage) bits.push(`${m.damage} damage this turn`);
      if (m.entered === s.turn) bits.push("entered this turn");
      if (m.attacked) bits.push("has attacked");
      if (m.atkPerm || m.defPerm) bits.push("Awakened");
      if (card(m.id).guard && m.position !== "def") bits.push("Guard is off (attack position)");
      note = bits.join(" · ");
    }
  }
  return (
    <div className="flex justify-center">
      <CardFace id={h.id} size="detail" atk={atk} def={dfn} damage={damage} note={note} />
    </div>
  );
}

function Options() {
  const { ui, actions } = useGame();
  const update = useStore(ui.duel, (d) => d.update);
  const selection = useStore(ui.duel, (d) => d.selection);
  const narrowed = useStore(ui.duel, (d) => d.narrowed);
  if (!update || !selection) return null;
  const options = narrowed ?? optionsFor(selection, update.legal);
  if (!options.length) return null;
  const me = update.view.you;
  return (
    <div className="paper p-2 flex flex-col gap-1">
      <div className="font-pixel text-[10px] opacity-70">Choose — or click a glowing slot</div>
      {options.map((a, i) => (
        <button
          key={i}
          className="btn text-left !text-[10px]"
          onClick={() => actions.act(a)}
          onMouseEnter={() => actions.hoverAction(a)}
          onMouseLeave={() => actions.hoverAction(null)}
        >
          {describeAction(a, update.view.state, me)}
        </button>
      ))}
      <button className="text-[14px] underline opacity-60 self-end" onClick={() => actions.select(null)}>cancel</button>
    </div>
  );
}

function Log() {
  const { ui } = useGame();
  const log = useStore(ui.duel, (d) => d.log);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [log]);
  const tone = { mine: "text-[#b4e08a]", theirs: "text-[#ffb3a6]", turn: "text-gold font-pixel text-[10px] mt-1", plain: "" };
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-ink/60 px-2 py-1 text-[15px] leading-[1.05]">
      {log.map((l) => <div key={l.id} className={tone[l.tone]}>{l.text}</div>)}
      <div ref={end} />
    </div>
  );
}

export function SidePanel() {
  const { actions } = useGame();
  return (
    <aside className="w-[300px] shrink-0 panel m-2 ml-0 p-3 flex flex-col gap-2 min-h-0">
      <Detail />
      <Options />
      <div className="font-pixel text-[10px] text-paper-dark">Duel log</div>
      <Log />
      <div className="flex gap-2">
        <button className="btn !text-[9px]" onClick={() => { if (confirm("Concede this duel?")) actions.act({ type: "concede" }); }}>Concede</button>
        <button className="btn !text-[9px]" onClick={() => actions.leave()}>Menu</button>
      </div>
    </aside>
  );
}
