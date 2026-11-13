import { card, CRESTS, DECKS, type CardRef, type DeckChoice } from "@sigilbound/engine";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  if (w.responder !== me) {
    return <div className="absolute top-3 left-1/2 -translate-x-1/2 panel px-4 py-2 font-pixel text-[11px] pointer-events-none z-20">Rival may respond…</div>;
  }
  const ambushes = update.legal.filter((a) => a.type === "ambush");
  const what = w.kind === "attack" ? `Rival attacks ${w.target.kind === "direct" ? "you directly" : "your monster"}!` : "Your monster was destroyed in battle!";
  return (
    <div className="absolute inset-x-0 top-3 flex justify-center pointer-events-none z-30">
      <div className="panel p-3 flex flex-col gap-2 pointer-events-auto min-w-[360px] pop-in">
        <div className="font-pixel text-[13px] text-gold">Ambush window</div>
        <div>{what}</div>
        <div className="h-3 bg-ink" style={{ boxShadow: "inset 0 0 0 1px #000" }}>
          <div className="h-full bg-hp" style={{ width: `${(left / 3000) * 100}%` }} />
        </div>
        <div className="flex gap-2 items-end">
          {ambushes.map((a, i) => {
            const c = s.players[me].hand.find((x) => "uid" in a && x.uid === a.uid);
            return (
              <button key={"uid" in a ? a.uid : 0} className="flex flex-col items-center gap-1" onClick={() => actions.act(a)}>
                {c ? <CardFace id={c.id} /> : null}
                <span className="btn btn-gold !text-[9px]">{i + 1}: {describeAction(a, s, me)}</span>
              </button>
            );
          })}
          {!ambushes.length ? <span className="opacity-70 text-[15px]">No Ambush you can play here.</span> : null}
          <div className="flex-1" />
          <button className="btn" onClick={() => actions.act({ type: "pass" })}>Pass (P)</button>
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
    <div className="absolute inset-0 bg-ink/70 flex items-center justify-center z-50 pop-in">
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

/** The opening hand: pick cards to send back. */
export function Mulligan() {
  const { ui, actions } = useGame();
  const update = useStore(ui.duel, (d) => d.update);
  const mulligan = useStore(ui.duel, (d) => d.mulligan);
  const focus = useStore(ui.duel, (d) => d.focus);
  if (!update) return null;
  const s = update.view.state, me = update.view.you;
  if (s.step !== "mulligan") return null;
  if (s.players[me].mulliganDone) {
    return <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 panel px-4 py-2 font-pixel text-[12px] z-30">Waiting for the rival's mulligan…</div>;
  }
  const hand = s.players[me].hand;
  return (
    <div className="absolute inset-0 bg-ink/70 flex flex-col items-center justify-center gap-4 z-30">
      <div className="font-pixel text-[18px] text-gold">Opening hand</div>
      <div className="text-[18px] opacity-85">Pick cards to send back and draw again. Click a card to read it.</div>
      <div className="flex gap-3">
        {hand.map((c, i) => {
          const marked = mulligan.includes(c.uid);
          return (
            <div key={c.uid} className={`flex flex-col items-center gap-2 ${focus?.area === "hand" && focus.index === i ? "focus-ring" : ""}`}>
              <button className={`transition-transform hover:-translate-y-1 ${marked ? "opacity-40" : ""}`} onClick={() => actions.openPopup({ kind: "hand", uid: c.uid })}>
                <CardFace id={c.id} />
              </button>
              <button className={`btn !text-[9px] ${marked ? "btn-red" : ""}`} onClick={() => actions.toggleMulligan(c.uid)}>
                {i + 1}: {marked ? "↺ Sending back" : "Keep"}
              </button>
            </div>
          );
        })}
      </div>
      <button className="btn btn-gold" onClick={() => actions.act({ type: "mulligan", uids: mulligan })}>
        {mulligan.length ? `Mulligan ${mulligan.length}` : "Keep hand"} (Enter)
      </button>
    </div>
  );
}

/** After dropping a monster on a slot: attack or defense, right there on the slot. */
export function AskPosition() {
  const { ui, actions } = useGame();
  const ask = useStore(ui.duel, (d) => d.ask);
  const update = useStore(ui.duel, (d) => d.update);
  if (!ask || !update) return null;
  const r = actions.boardRect(ask.key);
  if (!r) return null;
  const id = update.view.state.players[update.view.you].hand.find((c) => c.uid === ask.uid)?.id;
  return (
    <div className="fixed inset-0 z-40" onPointerDown={() => actions.answerAsk(null)}>
      <div
        className="absolute flex flex-col items-center gap-1 pop-in"
        style={{ left: r.left + r.width / 2, top: r.top + r.height / 2, transform: "translate(-50%, -50%)" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="font-pixel text-[10px] bg-ink px-2 py-1">{id ? card(id).name : ""}: position?</div>
        <div className="flex gap-2">
          {(["atk", "def"] as const).map((p) => (
            <button key={p} className={`pos-btn ${ask.choice === p ? "on" : ""}`} onClick={() => actions.answerAsk(p)}>
              <span className={`pos-icon ${p}`} />
              <span className="font-pixel text-[10px]">{p === "atk" ? "ATK (A)" : "DEF (D)"}</span>
            </button>
          ))}
        </div>
        <div className="text-[14px] bg-ink/80 px-2">Enter confirms · Esc cancels</div>
      </div>
    </div>
  );
}

/** The card following the pointer while dragging from the hand. */
export function DragGhost() {
  const { ui } = useGame();
  const drag = useStore(ui.duel, (d) => d.drag);
  if (!drag) return null;
  return (
    <div className="fixed z-50 pointer-events-none" style={{ left: drag.x - 50, top: drag.y - 70, transform: `rotate(${drag.over ? 0 : -6}deg) scale(${drag.over ? 0.85 : 1})`, opacity: 0.92, transition: "transform 80ms steps(2)" }}>
      <CardFace id={drag.id} />
    </div>
  );
}

/** "Your turn", "Attack!": a band that sweeps across the board. */
export function Banner() {
  const { ui } = useGame();
  const banner = useStore(ui.duel, (d) => d.banner);
  if (!banner) return null;
  const color = banner.tone === "me" ? "bg-gold text-ink" : banner.tone === "opp" ? "bg-[#5a3a7a] text-paper" : "bg-hp text-paper";
  return (
    <div key={banner.id} className="absolute inset-x-0 top-[40%] z-30 pointer-events-none overflow-hidden banner-wrap">
      <div className={`banner font-pixel text-[30px] py-3 text-center ${color}`} style={{ textShadow: "3px 3px 0 #1c1a24" }}>
        {banner.text}
      </div>
    </div>
  );
}

export function ConfirmEnd() {
  const { ui, actions } = useGame();
  const n = useStore(ui.duel, (d) => d.confirmEnd);
  if (n === null) return null;
  return (
    <div className="absolute inset-0 bg-ink/50 flex items-center justify-center z-50" onPointerDown={() => actions.cancelEnd()}>
      <div className="panel p-4 flex flex-col gap-3 pop-in" onPointerDown={(e) => e.stopPropagation()}>
        <div className="font-pixel text-[13px] text-gold">End your turn?</div>
        <div>You still have {n} thing{n === 1 ? "" : "s"} you could play or attack with.</div>
        <div className="flex gap-2 justify-end">
          <button className="btn" onClick={() => actions.cancelEnd()}>Keep playing (Esc)</button>
          <button className="btn btn-gold" onClick={() => actions.endTurn(true)}>End turn (Enter)</button>
        </div>
      </div>
    </div>
  );
}

const KEYS: [string, string][] = [
  ["← →", "Move along your hand (the card lifts)"],
  ["1–9", "Open that hand card"],
  ["Enter / Space", "Open the focused card"],
  ["↑ / Tab", "Focus your monsters; ← → between them"],
  ["↓ / Tab", "Back to your hand"],
  ["In a card: 1/2/3 or ← →", "Pick the lane (or target)"],
  ["In a card: A / D (↑ ↓)", "Attack or Defense position"],
  ["In a card: B", "Bind as a Sigil"],
  ["In a card: S", "Switch a monster's position"],
  ["In a card: Enter", "Confirm (or Attack, on a monster)"],
  ["Esc", "Back one step, then close"],
  ["E", "End turn"],
  ["P", "Pass an Ambush window (1–9 plays one)"],
  ["L", "Show the duel log"],
  ["?", "This help"],
];

export function Help() {
  const { ui, actions } = useGame();
  const open = useStore(ui.duel, (d) => d.help);
  if (!open) return null;
  return (
    <div className="absolute inset-0 bg-ink/60 flex items-center justify-center z-50" onPointerDown={() => actions.toggle("help")}>
      <div className="panel p-4 flex flex-col gap-2 pop-in max-w-[640px] max-h-[92vh] overflow-y-auto" onPointerDown={(e) => e.stopPropagation()}>
        <div className="font-pixel text-[13px] text-gold">Controls</div>
        <div className="text-[17px] opacity-85">Mouse: drag a card onto the board to play it, or onto your Sigil row to bind it. Drag a monster onto an enemy to attack, or to a lane next to it to move. Click any card to read it. Right-click your monster to switch its position.</div>
        <table className="text-[17px]">
          <tbody>
            {KEYS.map(([k, v]) => (
              <tr key={k}><td className="font-pixel text-[10px] text-paper-dark pr-4 py-0.5 whitespace-nowrap">{k}</td><td>{v}</td></tr>
            ))}
          </tbody>
        </table>
        <button className="btn self-end" onClick={() => actions.toggle("help")}>Close (Esc)</button>
      </div>
    </div>
  );
}

/** Grouped "Name ×n" entries, sorted by cost then name. */
function grouped(ids: string[]): { id: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].map(([id, n]) => ({ id, n }))
    .sort((a, b) => card(a.id).cost - card(b.id).cost || card(a.id).name.localeCompare(card(b.id).name));
}

function CardGrid({ entries, onPick }: { entries: { id: string; n?: number; key: string }[]; onPick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-6 gap-2 overflow-y-auto max-h-[60vh] p-1">
      {entries.map((e) => (
        <button key={e.key} className="relative hover:-translate-y-1 transition-transform" onClick={() => onPick(e.id)}>
          <CardFace id={e.id} />
          {e.n !== undefined ? <span className="absolute -top-1 -right-1 font-pixel text-[11px] bg-ink text-gold px-1">×{e.n}</span> : null}
        </button>
      ))}
      {!entries.length ? <div className="opacity-60 col-span-6">Empty.</div> : null}
    </div>
  );
}

/** Your deck's remaining cards (counts only, never the order) or a discard pile. */
export function PileViewer() {
  const { ui, actions } = useGame();
  const pile = useStore(ui.duel, (d) => d.pile);
  const update = useStore(ui.duel, (d) => d.update);
  if (!pile || !update) return null;
  const s = update.view.state, me = update.view.you;
  let title: string, sub: string, entries: { id: string; n?: number; key: string }[];
  if (pile.kind === "deck") {
    const list = grouped(update.view.deckList);
    title = `Your deck: ${update.view.deckList.length} cards left`;
    sub = "What's still in it, sorted by cost. The order is secret, even to you.";
    entries = list.map((e) => ({ ...e, key: e.id }));
  } else {
    const p = pile.side === "me" ? me : me === 0 ? 1 : 0;
    const discard: CardRef[] = s.players[p].discard;
    title = `${pile.side === "me" ? "Your" : "Rival's"} discard pile: ${discard.length}`;
    sub = "Newest first. Discard piles are public.";
    entries = [...discard].reverse().map((c) => ({ id: c.id, key: String(c.uid) }));
  }
  return (
    <div className="absolute inset-0 bg-ink/70 flex items-center justify-center z-40" onPointerDown={() => actions.closePile()}>
      <div className="panel p-4 flex flex-col gap-2 max-w-[760px] pop-in" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-baseline gap-3">
          <div className="font-pixel text-[13px] text-gold">{title}</div>
          <div className="flex-1" />
          <button className="btn !text-[10px]" onClick={() => actions.closePile()}>Close (Esc)</button>
        </div>
        <div className="text-[16px] opacity-80">{sub}</div>
        <CardGrid entries={entries} onPick={(id) => actions.openPopup({ kind: "card", id })} />
      </div>
    </div>
  );
}

/** The full 30-card list of a deck, from the title screen. */
export function DeckList() {
  const { ui, actions } = useGame();
  const deck = useStore(ui.app, (a) => a.deckList);
  if (!deck) return null;
  const d = DECKS[deck as DeckChoice]!;
  const ids = Object.entries(d.cards).flatMap(([id, n]) => Array.from({ length: n }, () => id));
  return (
    <div className="absolute inset-0 bg-ink/70 flex items-center justify-center z-40" onPointerDown={() => actions.showDeckList(null)}>
      <div className="panel p-4 flex flex-col gap-2 max-w-[760px] pop-in" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-baseline gap-3">
          <div className="font-pixel text-[13px] text-gold">{d.name}: {ids.length} cards</div>
          <div className="text-[15px] opacity-75">Crest: {CRESTS[d.crest].name} ({CRESTS[d.crest].text})</div>
          <div className="flex-1" />
          <button className="btn !text-[10px]" onClick={() => actions.showDeckList(null)}>Close (Esc)</button>
        </div>
        <CardGrid entries={grouped(ids).map((e) => ({ ...e, key: e.id }))} onPick={(id) => actions.openPopup({ kind: "card", id })} />
      </div>
    </div>
  );
}

export function LogDrawer() {
  const { ui, actions } = useGame();
  const log = useStore(ui.duel, (d) => d.log);
  const open = useStore(ui.duel, (d) => d.logOpen);
  const end = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [log, open]);
  if (!open) return null;
  const tone = { mine: "text-[#b4e08a]", theirs: "text-[#ffb3a6]", turn: "text-gold font-pixel text-[10px] mt-1", plain: "" };
  return (
    <div className="absolute right-2 top-14 bottom-40 w-[300px] panel p-2 flex flex-col z-20 pop-in">
      <div className="flex items-center font-pixel text-[10px] text-paper-dark mb-1">
        <span>Duel log</span><div className="flex-1" /><button className="underline" onClick={() => actions.toggle("logOpen")}>close (L)</button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto bg-ink/60 px-2 py-1 text-[15px] leading-[1.05]">
        {log.map((l) => <div key={l.id} className={tone[l.tone]}>{l.text}</div>)}
        <div ref={end} />
      </div>
    </div>
  );
}

/** Phase, End turn and the few buttons not tied to one card. */
export function TurnControls() {
  const { ui, actions } = useGame();
  const update = useStore(ui.duel, (d) => d.update);
  if (!update) return null;
  const s = update.view.state, me = update.view.you;
  const legal = update.legal;
  const mine = s.active === me && s.step !== "mulligan" && s.step !== "over";
  const tide = legal.find((a) => a.type === "crest" && a.lane === undefined);
  const pl = s.players[me];
  const phase = s.step === "over" ? "Duel over" : s.step === "mulligan" ? "Mulligan" : s.window ? (s.window.responder === me ? "Ambush window!" : "Rival may Ambush…")
    : !mine ? `Rival's turn${s.step === "attack" ? " · attacking" : ""}` : s.step === "attack" ? "Your attack step" : "Your turn · Main";
  const hint = mine && s.step === "main" ? (pl.bound ? "Sigil bound this turn." : "No bind yet: you'll draw 1 extra at the end.") : "";
  return (
    <>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-end gap-2 z-10 w-[128px]">
        <div className={`font-pixel text-[11px] px-2 py-1 text-right ${mine ? "bg-gold text-ink" : "bg-ink/80 text-paper"}`}>Turn {s.turn}<br />{phase}</div>
        {hint ? <div className="text-[15px] text-right leading-tight bg-ink/70 px-1">{hint}</div> : null}
        {legal.some((a) => a.type === "attackStep") ? (
          <button className="btn btn-red" onClick={() => actions.act({ type: "attackStep" })}>Attack step ⚔</button>
        ) : null}
        {tide ? <button className="btn" onClick={() => actions.act(tide)}>Tide crest +2 LP</button> : null}
        {legal.some((a) => a.type === "endTurn") ? (
          <button className="btn btn-gold !text-[14px] !py-3" onClick={() => actions.endTurn(true)}>End turn (E)</button>
        ) : null}
        <div className="text-[14px] text-right opacity-70 bg-ink/60 px-1">{CRESTS[pl.crest].name} crest: {CRESTS[pl.crest].text}</div>
      </div>
      <div className="absolute left-2 top-2 flex gap-1 z-10">
        <button className="btn !text-[9px]" onClick={() => actions.leave()}>Menu</button>
        <button className="btn !text-[9px]" onClick={() => { if (confirm("Concede this duel?")) actions.act({ type: "concede" }); }}>Concede</button>
        <button className="btn !text-[9px]" onClick={() => actions.toggle("logOpen")}>Log (L)</button>
        <button className="btn !text-[9px]" onClick={() => actions.toggle("help")}>? Keys</button>
      </div>
    </>
  );
}

export function ErrorToast() {
  const { ui } = useGame();
  const error = useStore(ui.app, (a) => a.error);
  if (!error) return null;
  return <div className="absolute top-14 left-1/2 -translate-x-1/2 panel px-4 py-2 text-hp z-50">{error}</div>;
}
