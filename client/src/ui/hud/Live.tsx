/** HUD pieces that follow the duel live: hover info, the rival's reveals, the play log, the turn dock and bar. */
import { card, CRESTS, type PlayerId } from "@sigilbound/engine";
import { useLayoutEffect, useRef } from "react";
import { useGame } from "../context.js";
import type { PopupSrc } from "../state.js";
import { useStore } from "../useStore.js";
import { cardInfo } from "./cardInfo.js";
import { CardFace, Kw, KeywordList } from "./CardFace.js";
import { anchorOf, Floating } from "./Floating.js";

/** Hovering a monster (or your spell, or a Sigil) on the board: its numbers and what each keyword means, beside it. */
export function HoverInfo() {
  const { ui, actions } = useGame();
  const hover = useStore(ui.duel, (d) => d.hover);
  const update = useStore(ui.duel, (d) => d.update);
  const popup = useStore(ui.duel, (d) => d.popup);
  const drag = useStore(ui.duel, (d) => d.drag);
  const inspect = useStore(ui.duel, (d) => d.inspect);
  const reveal = useStore(ui.duel, (d) => d.reveal);
  if (!hover || !update || drag || inspect || reveal) return null;
  const s = update.view.state, me: PlayerId = update.view.you;
  const [side, kind, l] = hover.key.split(":");
  const lane = Number(l);
  let src: PopupSrc | null = null;
  let hiddenText = "";
  if (kind === "monster") src = side === "me" ? { kind: "monster", lane } : { kind: "enemy", lane };
  else if (kind === "spell") {
    if (side === "me") src = { kind: "spell", lane };
    else hiddenText = "A face-down spell. Nobody but the rival knows what it is until it's flipped.";
  } else if (side === "sigil") {
    const sg = s.players[me].sigils[lane];
    if (sg && sg.id !== "hidden") src = { kind: "card", id: sg.id, note: sg.tapped ? "Sigil · tapped" : "Sigil · ready to pay" };
  }
  // The selected card's menu already shows this.
  if (popup && src && JSON.stringify(popup.src) === JSON.stringify(src)) return null;
  const anchor = actions.boardRect(hover.key);
  if (hiddenText) {
    return (
      <Floating anchor={anchor} mode="side" interactive={false} z={30}>
        <div className="panel p-2 w-[220px] text-[16px] leading-tight">{hiddenText}</div>
      </Floating>
    );
  }
  const info = src ? cardInfo(src, s, me) : null;
  if (!info) return null;
  const def = card(info.id);
  return (
    <Floating anchor={anchor} mode="side" interactive={false} z={30}>
      <div className="panel p-2 w-[250px] flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <span className="font-pixel text-[11px] flex-1 truncate">{def.name}</span>
          {def.kind === "monster" ? (
            <span className="font-pixel text-[10px] bg-ink px-1">
              <span className="text-[#ffb35c]">{info.atk ?? def.atk}</span>/<span className="text-[#9fd3ff]">{(info.def ?? def.def) - (info.damage ?? 0)}</span>
            </span>
          ) : null}
        </div>
        {info.notes.length ? <div className="text-[15px] leading-tight opacity-90">{info.notes.join(" · ")}</div> : null}
        {def.text ? <div className="text-[15px] leading-tight paper px-1.5 py-1">{def.text}</div> : null}
        <KeywordList keys={info.keys} hot={hover.kw} />
        <div className="text-[13px] opacity-60">Click to select · I to read</div>
      </div>
    </Floating>
  );
}

/** Hovering a hand card for a moment: the card big above it, with its keywords spelled out. */
export function HandPreview() {
  const { ui, actions } = useGame();
  const uid = useStore(ui.duel, (d) => d.handHover);
  const update = useStore(ui.duel, (d) => d.update);
  const popup = useStore(ui.duel, (d) => d.popup);
  const drag = useStore(ui.duel, (d) => d.drag);
  const inspect = useStore(ui.duel, (d) => d.inspect);
  const reveal = useStore(ui.duel, (d) => d.reveal);
  if (uid === null || !update || drag || inspect || popup || reveal) return null;
  const src: PopupSrc = { kind: "hand", uid };
  const info = cardInfo(src, update.view.state, update.view.you);
  if (!info) return null;
  return (
    <Floating anchor={anchorOf(src, actions)} mode="above" interactive={false} z={30} gap={6}>
      <div className="flex gap-2 items-end">
        <CardFace id={info.id} size="big" atk={info.atk} />
        {info.keys.length || info.notes.length ? (
          <div className="panel p-2 w-[220px] flex flex-col gap-1">
            {info.notes.length ? <div className="text-[15px] leading-tight">{info.notes.join(" · ")}</div> : null}
            <KeywordList keys={info.keys} />
          </div>
        ) : null}
      </div>
    </Floating>
  );
}

/** The rival's play: the card flies out of its hand to the middle of the board, holds, then goes where it goes. */
export function Reveal() {
  const { ui, actions } = useGame();
  const reveal = useStore(ui.duel, (d) => d.reveal);
  const ref = useRef<HTMLDivElement>(null);
  const centre = reveal ? actions.boardRect("revealAt") : null;
  const board = reveal ? actions.boardRect("field") : null;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !reveal || !centre) return;
    const at = (key: string) => {
      const r = actions.boardRect(key);
      return r ? { x: r.left + r.width / 2 - (centre.left + 1), y: r.top + r.height / 2 - (centre.top + 1) } : { x: 0, y: -200 };
    };
    const hidden = reveal.id === "hidden";
    if (reveal.phase === "in") {
      const f = at(reveal.from);
      el.animate([
        { transform: `translate(${f.x}px, ${f.y}px) scale(0.2)`, opacity: 0.3 },
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
      ], { duration: 260, easing: "cubic-bezier(.2,.8,.3,1)", fill: "both" });
    } else {
      const t = at(reveal.to);
      el.animate([
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${t.x}px, ${t.y}px) scale(0.2)`, opacity: hidden ? 0.6 : 0 },
      ], { duration: 220, easing: "ease-in", fill: "both" });
    }
  }, [reveal?.n, reveal?.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!reveal || !centre || !board) return null;
  const fit = Math.min(1, (board.height * 0.62) / 352);
  return (
    <div className="fixed inset-0 z-[38]" onPointerDown={() => actions.skip("move")}>
      <div className="absolute" style={{ left: centre.left + 1, top: centre.top + 1 }}>
        <div ref={ref} className="absolute" style={{ left: 0, top: 0 }}>
          <div className="flex flex-col items-center" style={{ transform: `translate(-50%, -50%) scale(${fit})`, transformOrigin: "center" }}>
            <div className="font-pixel text-[13px] bg-[#5a3a7a] text-paper px-2 py-1 mb-1" style={{ textShadow: "2px 2px 0 #1c1a24" }}>
              {reveal.id === "hidden" ? "RIVAL" : card(reveal.id).kind === "ambush" ? "AMBUSH!" : "RIVAL PLAYS"}
            </div>
            <CardFace id={reveal.id} size="big" />
            <div className="panel px-3 py-2 mt-2 text-[22px] leading-tight w-[300px] text-center">
              {reveal.caption}
              <span className="block text-[14px] opacity-60">click or any key to skip</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The play log: one line under the top bar; opens into a scrollable list. Click a line to see its card. */
export function PlayLog() {
  const { ui, actions } = useGame();
  const log = useStore(ui.duel, (d) => d.log);
  const open = useStore(ui.duel, (d) => d.logOpen);
  const end = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [log, open]);
  const tone = { mine: "text-[#b4e08a]", theirs: "text-[#ffb3a6]", turn: "text-gold font-pixel text-[10px] mt-1", plain: "" };
  const last = [...log].reverse().find((l) => l.play) ?? log[log.length - 1];
  return (
    <div className="relative flex flex-col items-start gap-1 min-w-0 pointer-events-auto">
      <button
        className="flex items-center gap-2 bg-ink/85 px-2 py-0.5 text-left max-w-full"
        style={{ boxShadow: "inset 0 0 0 1px #4a2e18" }}
        onClick={() => actions.toggle("logOpen")}
        title="Duel log (L)"
      >
        <span className="font-pixel text-[9px] text-paper-dark shrink-0">LOG {open ? "▴" : "▾"}</span>
        {!open && last ? <span className={`text-[15px] truncate ${tone[last.tone]}`}>{last.text}</span> : null}
      </button>
      {open ? (
        <div className="panel p-1.5 w-[400px] max-w-[60vw] pop-in absolute top-[30px] left-0">
          <div className="max-h-[42vh] overflow-y-auto bg-ink/60 px-2 py-1 text-[15px] leading-[1.1]">
            {log.map((l) => (
              <div
                key={l.id}
                className={`${tone[l.tone]} ${l.play ? "font-bold" : "opacity-85 pl-2"} ${l.card ? "cursor-pointer hover:bg-paper/10" : ""}`}
                onClick={() => { if (l.card) actions.inspect({ kind: "card", id: l.card }); }}
              >
                {l.text}
              </div>
            ))}
            <div ref={end} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Top bar: menu buttons on the left, turn and phase in the middle. */
export function TopBar() {
  const { ui, actions } = useGame();
  const update = useStore(ui.duel, (d) => d.update);
  if (!update) return null;
  const s = update.view.state, me = update.view.you;
  const mine = s.active === me && s.step !== "mulligan" && s.step !== "over";
  const pl = s.players[me];
  const phase = s.step === "over" ? "Duel over" : s.step === "mulligan" ? "Mulligan"
    : s.window ? (s.window.responder === me ? "Ambush window!" : "Rival may Ambush…")
    : !mine ? `Rival's turn${s.step === "attack" ? " · attacking" : ""}` : s.step === "attack" ? "Your attack step" : "Your turn · Main";
  const crest = CRESTS[pl.crest];
  return (
    <div className="absolute inset-x-0 top-0 h-[40px] flex items-center gap-1 px-2 z-20 pointer-events-none">
      <div className="flex gap-1 pointer-events-auto">
        <button className="btn !text-[9px]" onClick={() => actions.leave()}>Menu</button>
        <button className="btn !text-[9px]" onClick={() => { if (confirm("Concede this duel?")) actions.act({ type: "concede" }); }}>Concede</button>
        <button className="btn !text-[9px]" onClick={() => actions.toggle("help")}>? Keys</button>
      </div>
      <div className="flex shrink-0">
        <div className={`font-pixel text-[11px] px-3 py-1 pointer-events-auto flex items-center gap-2 whitespace-nowrap ${mine ? "bg-gold text-ink" : "bg-ink/85 text-paper"}`}>
          <span>Turn {s.turn} · {phase}</span>
          <span className="opacity-40">|</span>
          <CrestChip name={`${crest.name} crest`} text={`${crest.text} Costs 2 Sigils, once per turn.`} />
        </div>
      </div>
      <div className="flex-1 min-w-0"><PlayLog /></div>
    </div>
  );
}

function CrestChip({ name, text }: { name: string; text: string }) {
  // The crest isn't a card keyword, so it brings its own tip.
  return <Kw k="crest" tip={{ name, text }}>{name}</Kw>;
}

/** Bottom left, beside the hand: End turn and Attack step on your turn, skip controls on the rival's. */
export function TurnDock() {
  const { ui, actions } = useGame();
  const update = useStore(ui.duel, (d) => d.update);
  const playback = useStore(ui.duel, (d) => d.playback);
  const settings = useStore(ui.duel, (d) => d.settings);
  if (!update) return null;
  const s = update.view.state, me = update.view.you;
  if (s.step === "mulligan" || s.step === "over") return null;
  const legal = update.legal;
  const mine = s.active === me;
  const pl = s.players[me];
  const tide = legal.find((a) => a.type === "crest" && a.lane === undefined);
  const hint = mine && s.step === "main" ? (pl.bound ? "Sigil bound this turn." : "No bind yet: you'll draw 1 extra at the end.") : "";
  return (
    <div className="absolute left-2 bottom-2 z-[6] flex flex-col gap-1.5 w-[176px]">
      {mine ? (
        <>
          {hint ? <div className="text-[14px] leading-tight bg-ink/75 px-1">{hint}</div> : null}
          {tide ? <button className="btn !text-[10px]" onClick={() => actions.act(tide)}>Tide crest +2 LP</button> : null}
          {legal.some((a) => a.type === "attackStep") ? (
            <button className="btn btn-red" onClick={() => actions.act({ type: "attackStep" })}>Attack step ⚔</button>
          ) : null}
          {legal.some((a) => a.type === "endTurn") ? (
            <button className="btn btn-gold !text-[14px] !py-3" onClick={() => actions.endTurn(true)}>End turn (E)</button>
          ) : null}
        </>
      ) : (
        <div className="panel p-2 flex flex-col gap-1.5">
          <div className="font-pixel text-[10px] text-paper-dark">
            Rival's turn{playback === "decision" ? " · fast" : playback === "turn" ? " · skipping" : ""}
          </div>
          <div className="flex gap-1">
            <button className="btn flex-1 !text-[9px] !px-1" title="Skip this move (S or →)" onClick={() => actions.skip("move")}>▸ S</button>
            <button className={`btn flex-1 !text-[9px] !px-1 ${playback === "decision" ? "btn-gold" : ""}`} title="Fast until you need to decide (F)" onClick={() => actions.skip("decision")}>▸▸ F</button>
            <button className={`btn flex-1 !text-[9px] !px-1 ${playback === "turn" ? "btn-gold" : ""}`} title="Skip to the end of its turn (Shift+F or End)" onClick={() => actions.skip("turn")}>⏭ ⇧F</button>
          </div>
          <label className="flex items-center gap-1 text-[14px] cursor-pointer">
            <input type="checkbox" checked={settings.autoSkip} onChange={(e) => actions.setSettings({ autoSkip: e.target.checked })} />
            Auto-skip rival turns
          </label>
          <div className="flex items-center gap-1 text-[14px]">
            AI speed:
            {(["normal", "fast"] as const).map((v) => (
              <button key={v} className={`btn !text-[8px] !px-1.5 !py-0.5 ${settings.aiSpeed === v ? "btn-gold" : ""}`} onClick={() => actions.setSettings({ aiSpeed: v })}>{v}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Toast() {
  const { ui } = useGame();
  const toast = useStore(ui.duel, (d) => d.toast);
  if (!toast) return null;
  return (
    <div key={toast.id} className="absolute top-[48px] left-1/2 -translate-x-1/2 panel px-4 py-2 text-[18px] z-40 pop-in pointer-events-none">
      {toast.text}
    </div>
  );
}
