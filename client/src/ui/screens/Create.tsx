/** Character creation: cycle each chibi part and colour, name the character, then enter the world. */
import { useEffect, useMemo, useRef, useState } from "react";
import { titleBackdropCanvas } from "../../gfx/board-art.js";
import {
  PARTS, SLOTS, SLOT_LABELS, chibiPortrait, chibiSprite, partLabel, randomAppearance, serializeAppearance, swatch,
  type Appearance, type Dir, type Frame, type Slot,
} from "../../gfx/chibi.js";
import { dataUrl } from "../../gfx/sprites.js";
import { NAME_MAX, cycle, initialCreation, moveRow, validateName } from "../../core/creation.js";
import { useGame } from "../context.js";
import { useStore } from "../useStore.js";

const WALK: Frame[] = [1, 0, 2, 0];
const DIRS: Dir[] = ["down", "left", "up", "right"];

/** The walk sprite turning through each facing, stepping as it goes. */
function WalkPreview({ a }: { a: Appearance }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((n) => n + 1), 180);
    return () => clearInterval(id);
  }, []);
  const dir = DIRS[Math.floor(t / 12) % DIRS.length]!;
  const frame = WALK[t % WALK.length]!;
  const src = dataUrl(chibiSprite(a, dir, frame));
  return <img className="pixel" src={src} width={24 * 4} height={32 * 4} alt="" draggable={false} />;
}

function SlotRow({ slot, value, active, onCycle, onHover }: {
  slot: Slot; value: string; active: boolean; onCycle: (step: number) => void; onHover: () => void;
}) {
  const color = swatch(slot, value);
  const opts = PARTS[slot];
  return (
    <div className={`create-row ${active ? "create-row-on" : ""}`} onPointerEnter={onHover}>
      <div className="font-pixel text-[11px] w-[112px] opacity-80">{SLOT_LABELS[slot]}</div>
      <button className="btn !px-2" aria-label={`Previous ${SLOT_LABELS[slot]}`} onClick={() => onCycle(-1)}>◀</button>
      <div className="flex-1 flex items-center justify-center gap-2 font-pixel text-[12px]">
        {color ? <span className="create-swatch" style={{ background: color }} /> : null}
        <span>{partLabel(slot, value)}</span>
        <span className="text-[9px] opacity-50">{opts.indexOf(value) + 1}/{opts.length}</span>
      </div>
      <button className="btn !px-2" aria-label={`Next ${SLOT_LABELS[slot]}`} onClick={() => onCycle(1)}>▶</button>
    </div>
  );
}

export function Create() {
  const { ui } = useGame();
  const profile = useStore(ui.profile, (p) => p.profile);
  const backdrop = useMemo(() => dataUrl(titleBackdropCanvas()), []);
  const [st, setSt] = useState(() => initialCreation(profile, Date.now()));
  const [tried, setTried] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const check = validateName(st.name);

  const key = serializeAppearance(st.appearance);
  const portrait = useMemo(() => dataUrl(chibiPortrait(st.appearance, 96)), [key]);

  const cycleSlot = (slot: Slot, step: number) => setSt((s) => ({ ...s, appearance: cycle(slot, s.appearance, step) }));
  const randomize = () => setSt((s) => ({ ...s, appearance: randomAppearance(`${Date.now()}:${Math.random()}`) }));
  const enter = () => {
    setTried(true);
    const n = validateName(st.name);
    if (!n.ok) { nameRef.current?.focus(); return; }
    ui.setProfile({ name: n.name, appearance: st.appearance });
    ui.go("world");
  };
  const back = () => ui.go("title");

  // Keys for the pickers. Typing in the name field doesn't count (Enter there submits the form; Esc leaves the field).
  const live = useRef({ st, enter, back, randomize, cycleSlot });
  live.current = { st, enter, back, randomize, cycleSlot };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === "Escape") { e.preventDefault(); e.target.blur(); }
        return;
      }
      const L = live.current;
      const slot = SLOTS[L.st.row]!;
      const k = e.key;
      if (k === "ArrowUp" || k === "w" || k === "W") setSt((s) => ({ ...s, row: moveRow(s.row, -1) }));
      else if (k === "ArrowDown" || k === "s" || k === "S") setSt((s) => ({ ...s, row: moveRow(s.row, 1) }));
      else if (k === "ArrowLeft" || k === "a" || k === "A") L.cycleSlot(slot, -1);
      else if (k === "ArrowRight" || k === "d" || k === "D") L.cycleSlot(slot, 1);
      else if (k === "r" || k === "R") L.randomize();
      else if (k === "n" || k === "N") nameRef.current?.focus();
      else if (k === "Enter") L.enter();
      else if (k === "Escape") L.back();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative h-full bg-night overflow-x-clip overflow-y-auto">
      <div className="title-sky fixed" style={{ backgroundImage: `url(${backdrop})` }} />
      <div className="relative min-h-full flex flex-col items-center justify-center gap-5 py-6">
        <div className="title-logo font-pixel text-[32px] text-gold">{profile ? "Edit character" : "New character"}</div>
        <div className="flex gap-6 items-stretch">
          <div className="paper p-4 flex flex-col items-center gap-3 w-[320px]">
            <div className="create-stage">
              <img className="pixel" src={portrait} width={288} height={288} alt="Your character" draggable={false} />
            </div>
            <div className="flex items-end gap-4">
              <div className="create-walk"><WalkPreview a={st.appearance} /></div>
              <div className="font-pixel text-[16px] pb-3 max-w-[160px] break-words">{check.ok ? check.name : "???"}</div>
            </div>
          </div>
          <div className="paper p-4 flex flex-col gap-2 w-[420px] text-ink">
            {SLOTS.map((slot, i) => (
              <SlotRow
                key={slot} slot={slot} value={st.appearance[slot]} active={st.row === i}
                onCycle={(step) => { setSt((s) => ({ ...s, row: i })); cycleSlot(slot, step); }}
                onHover={() => setSt((s) => (s.row === i ? s : { ...s, row: i }))}
              />
            ))}
            <form
              className="flex flex-col gap-1 mt-2"
              onSubmit={(e) => { e.preventDefault(); enter(); }}
            >
              <label className="font-pixel text-[11px] opacity-80" htmlFor="create-name">Name (N)</label>
              <input
                id="create-name" ref={nameRef} className="create-name" value={st.name} maxLength={NAME_MAX + 8}
                autoComplete="off" spellCheck={false} placeholder="Your name"
                onChange={(e) => setSt((s) => ({ ...s, name: e.target.value }))}
              />
              <div className="text-[14px] min-h-[18px] text-hp">{tried && !check.ok ? check.error : ""}</div>
            </form>
            <div className="flex gap-3 justify-between mt-1">
              <button className="btn" onClick={back}>Back (Esc)</button>
              <button className="btn" onClick={randomize}>Randomize (R)</button>
              <button className="btn btn-gold" onClick={enter}>Enter the world ⏎</button>
            </div>
          </div>
        </div>
        <div className="text-[15px] opacity-70">↑↓ choose · ←→ change · R randomize · N name · Enter to begin</div>
      </div>
    </div>
  );
}
