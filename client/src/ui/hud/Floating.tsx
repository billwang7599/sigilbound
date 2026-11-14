/** HUD boxes that sit next to the thing they're about (a hand card, a board slot), kept on screen. */
import { useLayoutEffect, useRef, useState } from "react";
import type { UiActions, PopupSrc } from "../state.js";
import { layout, uiScale } from "../layout.js";
import { handGeometry, liftedCardBox, placeBox } from "../../core/layout.js";

/** Where a card is on screen right now. */
export function anchorOf(src: PopupSrc, actions: UiActions): DOMRect | null {
  switch (src.kind) {
    case "hand": {
      // Where the card is once lifted, worked out from its slot (the slot doesn't move while the card animates).
      const el = document.querySelector(`[data-hand-uid="${src.uid}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const u = uiScale();
      const b = liftedCardBox(r, handGeometry(layout().hand, u).lift, u);
      return new DOMRect(b.left, b.top, b.width, b.height);
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
 * Children placed beside `anchor` (see placeBox in core/layout.ts): "above", "side" (board slots: right if there's
 * room, else left) or "card" (hand cards: above if it fits, else beside, never over the card). Without an anchor it's
 * centred. Shrinks to fit a short window.
 */
export function Floating(props: {
  anchor: DOMRect | null;
  mode: "above" | "side" | "card";
  gap?: number;
  className?: string;
  interactive?: boolean;
  z?: number;
  children: React.ReactNode;
  onPointerDown?: (e: React.PointerEvent) => void;
  /** Marks it for click-outside handling (core/dismiss.ts). */
  zone?: string;
}) {
  const { anchor, mode, gap = 10, interactive = true } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [W, H] = useWindowSize();
  const [box, setBox] = useState<{ left: number; top: number; scale: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = placeBox(anchor && { left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height },
      mode, el.offsetWidth, el.offsetHeight, W, H, gap, uiScale());
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
      data-zone={props.zone}
    >
      {props.children}
    </div>
  );
}
