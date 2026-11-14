import { card, CRESTS, DECKS, type CardRef, type DeckChoice } from "@sigilbound/engine";
import { useEffect, useState } from "react";
import { describeAction } from "../../core/describe.js";
import { useGame } from "../context.js";
import { useStore } from "../useStore.js";
import { CardFace } from "./CardFace.js";
import { HAND_CARD_H, HAND_CARD_SCALE, HAND_CARD_W, mulliganScale } from "../../core/layout.js";
import { uiScale } from "../layout.js";
import { leaveToTitle, rematch, returnToWorld, worldDuelNpc } from "../../world/duel.js";
import { worldSession } from "../../world/session.js";

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
    return <div className="absolute top-[calc(var(--top-h)+8px)] inset-x-0 flex justify-center pointer-events-none z-20"><div className="u-t panel px-4 py-2 font-pixel text-[11px]">Rival may respond…</div></div>;
  }
  const ambushes = update.legal.filter((a) => a.type === "ambush");
  const what = w.kind === "attack" ? `Rival attacks ${w.target.kind === "direct" ? "you directly" : "your monster"}!` : "Your monster was destroyed in battle!";
  return (
    <div className="absolute inset-x-0 top-3 flex justify-center pointer-events-none z-30">
      <div className="u-t pointer-events-auto" data-zone="pass"><div className="panel p-3 flex flex-col gap-2 min-w-[360px] pop-in">
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
      </div></div>
    </div>
  );
}

export function GameOver() {
  const { ui } = useGame();
  const update = useStore(ui.duel, (d) => d.update);
  if (!update || update.view.state.step !== "over") return null;
  const s = update.view.state;
  const won = s.winner === update.view.you;
  return <GameOverPanel won={won} reason={s.endReason === "concede" ? (won ? "The rival conceded." : "You conceded.") : `After ${s.turn} turns.`} />;
}

function GameOverPanel({ won, reason }: { won: boolean; reason: string }) {
  const { ui, actions } = useGame();
  // A duel started in the world offers the way back (and a rematch with the same person) instead of deck picks.
  useStore(worldSession, (w) => w.s.duel);
  const npc = worldDuelNpc();
  if (npc) {
    return (
      <div className="absolute inset-0 bg-ink/70 flex items-center justify-center z-50 pop-in">
        <div className="u-c panel p-6 flex flex-col items-center gap-3">
          <div className={`font-pixel text-[28px] ${won ? "text-gold" : "text-hp"}`}>{won ? "Victory!" : "Defeat"}</div>
          <div>{won ? `You beat ${npc.name}!` : `${npc.name} wins this time.`} {reason}</div>
          <div className="flex gap-2">
            <button className="btn btn-gold" autoFocus onClick={() => returnToWorld(ui, actions, won)}>Return to the world</button>
            <button className="btn" onClick={() => rematch(actions)}>Rematch</button>
            <button className="btn" onClick={() => leaveToTitle(actions)}>Menu</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 bg-ink/70 flex items-center justify-center z-50 pop-in">
      <div className="u-c panel p-6 flex flex-col items-center gap-3">
        <div className={`font-pixel text-[28px] ${won ? "text-gold" : "text-hp"}`}>{won ? "Victory!" : "Defeat"}</div>
        <div>{reason}</div>
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
    return <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none"><div className="u-c panel px-4 py-2 font-pixel text-[12px]">Waiting for the rival's mulligan…</div></div>;
  }
  const hand = s.players[me].hand;
  const cs = mulliganScale(hand.length, window.innerWidth, window.innerHeight, uiScale());
  return (
    <div className="absolute inset-0 bg-ink/80 flex items-center justify-center z-30">
    <div className="u-c flex flex-col items-center gap-4">
      <div className="font-pixel text-[24px] text-gold" style={{ textShadow: "2px 2px 0 #14121c" }}>Opening hand</div>
      <div className="text-[20px] opacity-90">Pick cards to send back and draw again (1–9 or Space toggles). Click a card to read it.</div>
      <div className="flex gap-2">
        {hand.map((c, i) => {
          const marked = mulligan.includes(c.uid);
          return (
            <div key={c.uid} className={`flex flex-col items-center gap-2 ${focus?.area === "hand" && focus.index === i ? "focus-ring" : ""}`}>
              <button className={`transition-transform hover:-translate-y-1 ${marked ? "opacity-40" : ""}`} onClick={() => actions.inspect({ kind: "hand", uid: c.uid })}>
                <CardFace id={c.id} scale={cs} />
              </button>
              <button className={`btn !text-[12px] ${marked ? "btn-red" : ""}`} onClick={() => actions.toggleMulligan(c.uid)}>
                {i + 1}: {marked ? "↺ Sending back" : "Keep"}
              </button>
            </div>
          );
        })}
      </div>
      <button className="btn btn-gold !text-[15px] !px-5 !py-2.5" onClick={() => actions.act({ type: "mulligan", uids: mulligan })}>
        {mulligan.length ? `Mulligan ${mulligan.length}` : "Keep hand"} (Enter)
      </button>
    </div>
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
        className="absolute"
        style={{ left: r.left + r.width / 2, top: r.top + r.height / 2, transform: "translate(-50%, -50%)" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
      {/* pop-in animates transform, so it lives on an inner box: on the outer one it would undo the centring. */}
      <div className="u-c"><div className="flex flex-col items-center gap-1 pop-in">
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
      </div></div>
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
    <div className="fixed z-50 pointer-events-none" style={{ left: drag.x - HAND_CARD_W / 2, top: drag.y - HAND_CARD_H / 2, transformOrigin: `${HAND_CARD_W / 2}px ${HAND_CARD_H / 2}px`, transform: `rotate(${drag.over ? 0 : -6}deg) scale(calc(var(--u) * ${drag.over ? 0.85 : 1}))`, opacity: 0.92, transition: "transform 80ms steps(2)" }}>
      <CardFace id={drag.id} scale={HAND_CARD_SCALE} />
    </div>
  );
}

/** "Your turn", "Attack!": a band that sweeps across the board. */
export function Banner() {
  const { ui } = useGame();
  const banner = useStore(ui.duel, (d) => d.banner);
  if (!banner) return null;
  const color = banner.tone === "me" ? "bg-gold text-ink" : banner.tone === "opp" ? "bg-plum text-paper" : "bg-hp text-paper";
  return (
    <div key={banner.id} className="absolute inset-x-0 top-[40%] z-30 pointer-events-none overflow-hidden banner-wrap">
      <div className={`banner font-pixel text-[calc(30px*var(--u))] py-[calc(12px*var(--u))] text-center ${color}`} style={{ textShadow: "3px 3px 0 #14121c" }}>
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
      <div className="u-c"><div className="panel p-4 flex flex-col gap-3 pop-in" onPointerDown={(e) => e.stopPropagation()}>
        <div className="font-pixel text-[13px] text-gold">End your turn?</div>
        <div>You still have {n} thing{n === 1 ? "" : "s"} you could play or attack with.</div>
        <div className="flex gap-2 justify-end">
          <button className="btn" onClick={() => actions.cancelEnd()}>Keep playing (Esc)</button>
          <button className="btn btn-gold" onClick={() => actions.endTurn(true)}>End turn (Enter)</button>
        </div>
      </div></div>
    </div>
  );
}

const KEYS: [string, string][] = [
  ["← →", "Move along your hand (or along a board row)"],
  ["↑ ↓ / Tab", "Deck button → hand → your spells → your monsters → rival's monsters, and back"],
  ["1–9", "Select that hand card (menu opens); the same number again unselects it"],
  ["Space / Enter", "Select the focused card; again unselects it. Rival's card: read it"],
  ["In a menu: ← →", "Select the previous/next hand card (or your next monster) and open its menu; while a glowing lane/target is highlighted, step between those"],
  ["In a menu: ↑ ↓ / Tab", "Move between its options"],
  ["In a menu: Space / Enter", "Do the highlighted option (place the card, attack that target…)"],
  ["In a menu: A / D", "Attack or Defense position (A on a monster: attack)"],
  ["In a menu: B / S / M / C", "Bind as Sigil / Switch position / Move / Crest"],
  ["C", "Use your Crest (the button above your LP). If it needs a target: ← → between the glowing monsters, Space picks, Esc cancels"],
  ["Esc / click outside", "Back one step, then unselect, then focus back to your hand. Clicking outside a menu, the log or a Crest pick closes it"],
  ["I", "Read the hovered or focused card, big"],
  ["V", "Your deck: what's left (also the Deck button, or ↓ below your hand; → from there is your Crest)"],
  ["E", "End turn"],
  ["P", "Pass an Ambush window (1–9 plays one)"],
  ["Rival's turn: S", "Skip this move's animation (→ too, during a reveal)"],
  ["Rival's turn: F", "Fast-forward until you need to decide"],
  ["Rival's turn: Shift+F / End", "Skip to the end of its turn (still stops for your Ambush windows)"],
  ["Any key / click", "Skip a rival card reveal"],
  ["L", "Open or close the duel log"],
  ["?", "This help"],
];

export function Help() {
  const { ui, actions } = useGame();
  const open = useStore(ui.duel, (d) => d.help);
  if (!open) return null;
  return (
    <div className="absolute inset-0 bg-ink/60 flex items-center justify-center z-50" onPointerDown={() => actions.toggle("help")}>
      <div className="u-c panel p-4 flex flex-col gap-2 max-w-[640px] max-h-[calc(92vh/var(--u))] overflow-y-auto" onPointerDown={(e) => e.stopPropagation()}>
        <div className="font-pixel text-[13px] text-gold">Controls</div>
        <div className="text-[17px] opacity-85">Mouse: click a card to select it; its choices open beside it and the places it can go glow on the board, so click one. Or drag the card straight there (your Sigil row binds it). Click your monster, then a red enemy, to attack. Right-click your monster to switch position. Hover a card for its keywords; hover longer in your hand to see it big.</div>
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

function CardGrid({ entries, onPick }: { entries: { id: string; n?: number; key: string; gone?: boolean }[]; onPick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-6 gap-2 overflow-y-auto max-h-[calc(60vh/var(--u))] p-1">
      {entries.map((e) => (
        <button key={e.key} className={`relative hover:-translate-y-1 transition-transform ${e.gone ? "pile-gone" : ""}`} onClick={() => onPick(e.id)}>
          <CardFace id={e.id} />
          {e.n !== undefined ? <span className={`absolute -top-1 -right-1 font-pixel text-[11px] bg-ink px-1 ${e.gone ? "text-paper-dark" : "text-gold"}`}>×{e.n}</span> : null}
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
  let title: string, sub: string, entries: { id: string; n?: number; key: string; gone?: boolean }[];
  let summary: string[] = [];
  if (pile.kind === "deck") {
    const left = update.view.deckList;
    const counts = new Map(grouped(left).map((e) => [e.id, e.n]));
    // Every card your deck started with, so the ones you've already drawn show as ×0 (dimmed).
    const start = Object.values(DECKS).find((x) => x.name === s.players[me].deckName);
    const ids = start ? Object.keys(start.cards) : [...counts.keys()];
    title = `Your deck: ${left.length} card${left.length === 1 ? "" : "s"} left`;
    sub = "Grouped by card, sorted by cost. The draw order is secret, even to you. Dimmed: none left in the deck.";
    entries = grouped(ids).map((e) => ({ id: e.id, n: counts.get(e.id) ?? 0, key: e.id, gone: !counts.has(e.id) }));
    const monsters = left.filter((id) => card(id).kind === "monster").length;
    const byCost = new Map<number, number>();
    for (const id of left) byCost.set(card(id).cost, (byCost.get(card(id).cost) ?? 0) + 1);
    summary = [
      `${monsters} monster${monsters === 1 ? "" : "s"} · ${left.length - monsters} spell${left.length - monsters === 1 ? "" : "s"}`,
      "By cost: " + ([...byCost.entries()].sort((a, b) => a[0] - b[0]).map(([c, n]) => `${c}: ×${n}`).join("  ") || "none"),
    ];
  } else {
    const p = pile.side === "me" ? me : me === 0 ? 1 : 0;
    const discard: CardRef[] = s.players[p].discard;
    title = `${pile.side === "me" ? "Your" : "Rival's"} discard pile: ${discard.length}`;
    sub = "Newest first. Discard piles are public.";
    entries = [...discard].reverse().map((c) => ({ id: c.id, key: String(c.uid) }));
  }
  return (
    <div className="absolute inset-0 bg-ink/70 flex items-center justify-center z-40" onPointerDown={() => actions.closePile()}>
      <div className="u-c panel p-4 flex flex-col gap-2 max-w-[760px]" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-baseline gap-3">
          <div className="font-pixel text-[13px] text-gold">{title}</div>
          <div className="flex-1" />
          <button className="btn !text-[10px]" onClick={() => actions.closePile()}>Close (Esc)</button>
        </div>
        {summary.length ? (
          <div className="hud-strip px-2 py-1 flex flex-wrap gap-x-4 font-pixel text-[10px] text-paper">
            {summary.map((t) => <span key={t}>{t}</span>)}
          </div>
        ) : null}
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
      <div className="u-c panel p-4 flex flex-col gap-2 max-w-[760px]" onPointerDown={(e) => e.stopPropagation()}>
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

export function ErrorToast() {
  const { ui } = useGame();
  const error = useStore(ui.app, (a) => a.error);
  if (!error) return null;
  return <div className="absolute top-14 inset-x-0 flex justify-center z-50 pointer-events-none"><div className="u-t panel px-4 py-2 text-hp">{error}</div></div>;
}
