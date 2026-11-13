/** HUD boxes that sit next to the thing they're about (a hand card, a board slot), kept on screen. */
import { useLayoutEffect, useRef, useState } from "react";
import type { UiActions, PopupSrc } from "../state.js";
import { uiScale } from "../layout.js";

/** Where a card is on screen right now. */
export function anchorOf(src: PopupSrc, actions: UiActions): DOMRect | null {
  switch (src.kind) {
    case "hand": {
      // The slot, not the card: the card is mid-lift for a moment, the slot doesn't move. Lifted cards sit 46px up.
      const el = document.querySelector(`[data-hand-uid="${src.uid}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const u = uiScale();
      return new DOMRect(r.left, r.bottom - (140 + 46) * u, r.width, 140 * u);
    }
    case "monster": return actions.boardRect(`me:monster:${src.lane}`);
    case "enemy": return actions.boardRect(`opp:monster:${src.lane}`);
    case "spell": return actions.boardRect(`me:spell:${src.lane}`);
    case "card": return null;
  }
}

function useWindowSize(): [number, number] {
  const [size, setSize] = useState<[number, number]>([window.innerWidth, window.innerHeight]);
  useLayoutEffect(() => {
    const on = () => setSize([window.innerWidth, window.innerHeight]);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return size;
}

/**
 * Children placed beside `anchor`: "above" (hand cards), or "side" (board slots: right if there's room, else left).
 * Without an anchor it's centred. Shrinks to fit a short window.
 */
export function Floating(props: {
  anchor: DOMRect | null;
  mode: "above" | "side";
  gap?: number;
  className?: string;
  interactive?: boolean;
  z?: number;
  children: React.ReactNode;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const { anchor, mode, gap = 10, interactive = true } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [W, H] = useWindowSize();
  const [box, setBox] = useState<{ left: number; top: number; scale: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const scale = Math.min(uiScale(), (H - 16) / h, (W - 16) / w);
    const sw = w * scale, sh = h * scale;
    let left: number, top: number;
    if (!anchor) { left = (W - sw) / 2; top = (H - sh) / 2; }
    else if (mode === "above") {
      left = anchor.left + anchor.width / 2 - sw / 2;
      top = anchor.top - sh - gap;
      if (top < 8) top = 8;
    } else {
      const right = anchor.right + gap;
      left = right + sw <= W - 8 || anchor.left - gap - sw < 8 ? right : anchor.left - gap - sw;
      top = anchor.top + anchor.height / 2 - sh / 2;
    }
    left = Math.max(8, Math.min(W - sw - 8, left));
    top = Math.max(8, Math.min(H - sh - 8, top));
    const next = { left: Math.round(left), top: Math.round(top), scale };
    // Runs after every render (content can change size), but only re-renders when the place actually moved.
    setBox((cur) => (cur && cur.left === next.left && cur.top === next.top && cur.scale === next.scale ? cur : next));
  });
  return (
    <div
      ref={ref}
      className={`fixed ${props.className ?? ""}`}
      style={{
        left: box?.left ?? -9999, top: box?.top ?? -9999, zIndex: props.z ?? 35,
        transform: box && box.scale !== 1 ? `scale(${box.scale})` : undefined, transformOrigin: "top left",
        pointerEvents: interactive ? "auto" : "none", visibility: box ? "visible" : "hidden",
      }}
      onPointerDown={props.onPointerDown}
    >
      {props.children}
    </div>
  );
}
