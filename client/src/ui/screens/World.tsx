/**
 * The overworld screen: the Pixi hub (world/world.ts) filling the window, and React on top for talking — a
 * dialogue box with the NPC's portrait and name, lines that advance with Enter / Space / E or a click, and the
 * duel offer at the end ("Duel!" / "Not now"). Walking is arrows / WASD (the scene handles those); Esc goes back
 * to the title (or closes the dialogue).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { chibiPortrait } from "../../gfx/chibi.js";
import { dataUrl } from "../../gfx/sprites.js";
import { NPCS, npcById, type Npc } from "../../data/npcs.js";
import { startDuel } from "../../world/duel.js";
import { getPlayerLook } from "../../world/profile.js";
import { session } from "../../world/session.js";
import type { WorldView } from "../../world/world.js";
import { useGame } from "../context.js";
import { GraphicsToggle } from "../hud/GraphicsToggle.js";
import { useStore } from "../useStore.js";

type Talk =
  | { kind: "talk"; npc: Npc; line: number; choice: 0 | 1; starting: boolean }
  | { kind: "after"; npc: Npc; text: string };

const isAdvance = (k: string) => k === "Enter" || k === " " || k === "e" || k === "E";

function Portrait({ npc }: { npc: Npc }) {
  const src = useMemo(() => dataUrl(chibiPortrait(npc.appearance, 96)), [npc]);
  return <img className="pixel world-portrait" src={src} width={96} height={96} alt="" draggable={false} />;
}

function Dialogue({ talk, onAdvance, onChoose, onHover }: {
  talk: Talk; onAdvance: () => void; onChoose: (duel: boolean) => void; onHover: (c: 0 | 1) => void;
}) {
  const text = talk.kind === "talk" ? talk.npc.lines[talk.line]! : talk.text;
  const last = talk.kind === "talk" && talk.line === talk.npc.lines.length - 1;
  return (
    <div className="world-dialogue" onClick={() => { if (!last) onAdvance(); }} data-zone="dialogue">
      <div className="paper world-dialogue-box flex gap-4 p-4 pr-6">
        <Portrait npc={talk.npc} />
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <div className="font-pixel text-[13px] world-name">{talk.npc.name}</div>
          <div className="text-[22px] leading-tight">{text}</div>
          {last && talk.kind === "talk" ? (
            talk.starting ? <div className="font-pixel text-[11px] opacity-70">Shuffling decks…</div> : (
              <div className="flex gap-3 mt-1">
                <button className={`btn ${talk.choice === 0 ? "btn-gold" : ""}`} onPointerEnter={() => onHover(0)} onClick={(e) => { e.stopPropagation(); onChoose(true); }}>
                  Duel!
                </button>
                <button className={`btn ${talk.choice === 1 ? "btn-gold" : ""}`} onPointerEnter={() => onHover(1)} onClick={(e) => { e.stopPropagation(); onChoose(false); }}>
                  Not now
                </button>
                <span className="self-center text-[15px] opacity-60">
                  You'd play {talk.npc.deckId === "ember_rush" ? "Deepwall" : "Ember Rush"} vs their {talk.npc.deckId === "ember_rush" ? "Ember Rush" : "Deepwall"}
                </span>
              </div>
            )
          ) : <div className="world-more font-pixel text-[10px] self-end opacity-60">▼ Enter</div>}
        </div>
      </div>
    </div>
  );
}

export function World() {
  const { ui, actions } = useGame();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<WorldView | null>(null);
  const [near, setNear] = useState<string | null>(null);
  const [talk, setTalk] = useState<Talk | null>(null);
  const talkRef = useRef<Talk | null>(null);
  talkRef.current = talk;
  const connected = useStore(ui.app, (a) => a.connected);
  const error = useStore(ui.app, (a) => a.error);
  const me = useMemo(() => getPlayerLook(), []);

  // Build the scene on mount, tear it down on leave. Pixi loads with this screen, not before.
  useEffect(() => {
    let dead = false;
    const host = hostRef.current!;
    const s = session.get();
    void Promise.all([import("../../world/world.js"), document.fonts?.load("8px Silkscreen").catch(() => undefined)]).then(async ([{ WorldView }]) => {
      const view = await WorldView.create(host, { appearance: me.appearance, start: { pos: s.pos, facing: s.facing }, npcs: NPCS });
      if (dead) { view.destroy(); return; }
      viewRef.current = view;
      view.onNear = setNear;
      // Back from a duel: that NPC has something to say about it.
      const af = session.get().aftermath;
      const npc = af ? npcById(af.npcId) : undefined;
      if (af && npc) {
        session.clearAftermath();
        view.paused = true;
        view.faceNpcToPlayer(npc.id);
        setTalk({ kind: "after", npc, text: af.won ? npc.win : npc.lose });
      }
    });
    return () => {
      dead = true;
      const v = viewRef.current;
      if (v) { session.remember(v.playerState.pos, v.playerState.facing); v.destroy(); }
      viewRef.current = null;
    };
  }, [me]);

  const close = () => {
    const t = talkRef.current;
    const v = viewRef.current;
    if (t && v) { v.resetNpc(t.npc.id); v.paused = false; }
    setTalk(null);
  };
  const open = (id: string) => {
    const npc = npcById(id);
    const v = viewRef.current;
    if (!npc || !v) return;
    v.paused = true;
    v.faceNpcToPlayer(id);
    setTalk({ kind: "talk", npc, line: 0, choice: 0, starting: false });
  };
  const advance = () => {
    const t = talkRef.current;
    if (!t) return;
    if (t.kind === "after") return close();
    if (t.line < t.npc.lines.length - 1) setTalk({ ...t, line: t.line + 1 });
  };
  const choose = (duel: boolean) => {
    const t = talkRef.current, v = viewRef.current;
    if (!t || t.kind !== "talk" || t.starting) return;
    if (!duel || !v) return close();
    setTalk({ ...t, starting: true });
    startDuel(actions, t.npc, v.playerState);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = talkRef.current;
      if (t) {
        e.preventDefault();
        if (e.key === "Escape") return close();
        const last = t.kind === "talk" && t.line === t.npc.lines.length - 1;
        if (last && t.kind === "talk") {
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d", "A", "D", "Tab"].includes(e.key)) setTalk({ ...t, choice: t.choice === 0 ? 1 : 0 });
          else if (e.key === "1") choose(true);
          else if (e.key === "2") choose(false);
          else if (isAdvance(e.key)) choose(t.choice === 0);
          return;
        }
        if (isAdvance(e.key)) advance();
        return;
      }
      if (isAdvance(e.key)) {
        const id = viewRef.current?.talkTarget();
        if (id) { e.preventDefault(); open(id); }
      } else if (e.key === "Escape") {
        e.preventDefault();
        ui.go("title");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui]);

  const nearNpc = near ? npcById(near) : null;
  return (
    <div className="relative h-full overflow-clip bg-ink">
      <div ref={hostRef} className="absolute inset-0 flex items-center justify-center world-host" />
      <div className="world-hint hud-strip font-pixel text-[9px] px-2 py-1 flex flex-col gap-0.5">
        <span>{me.name}</span>
        <span className="opacity-75">Arrows / WASD walk · E talk · Esc menu</span>
      </div>
      {nearNpc && !talk ? (
        <div className="world-prompt hud-strip font-pixel text-[10px] px-3 py-1.5">
          <span className="text-gold">E</span> Talk to {nearNpc.name}
        </div>
      ) : null}
      {talk ? <Dialogue talk={talk} onAdvance={advance} onChoose={choose} onHover={(c) => talk.kind === "talk" && setTalk({ ...talk, choice: c })} /> : null}
      {!connected ? <div className="world-status hud-strip font-pixel text-[9px] px-2 py-1">Connecting to the server… (needed to duel)</div> : null}
      {error ? <div className="world-status hud-strip font-pixel text-[9px] px-2 py-1 text-hp">{error}</div> : null}
      <GraphicsToggle />
    </div>
  );
}
