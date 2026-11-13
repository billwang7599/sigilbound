import { GraphicsToggle } from "../hud/GraphicsToggle.js";
import { useCallback } from "react";
import { useGame } from "../context.js";
import { ActionMenu } from "../hud/ActionMenu.js";
import { CardPopup } from "../hud/CardPopup.js";
import { Hand } from "../hud/Hand.js";
import { HandPreview, HoverInfo, Reveal, Toast, TopBar, TurnDock } from "../hud/Live.js";
import {
  AmbushPrompt, AskPosition, Banner, ConfirmEnd, DragGhost, ErrorToast, GameOver, Help, Mulligan, PileViewer,
} from "../hud/Overlays.js";
import { useStore } from "../useStore.js";

/**
 * The duel screen. Nothing docks on the right: the turn and phase sit in the top bar, the log opens from the top
 * left, End turn and the rival-turn skip controls sit bottom left beside the hand, and a selected card's choices
 * open right next to it.
 */
export function Duel() {
  const { ui, actions } = useGame();
  const popup = useStore(ui.duel, (d) => d.popup);
  const inspect = useStore(ui.duel, (d) => d.inspect);
  const boardRef = useCallback((el: HTMLDivElement | null) => actions.attachBoard(el), [actions]);
  return (
    <div className="relative h-full overflow-clip bg-night">
      <div ref={boardRef} className="absolute inset-x-0 top-[var(--top-h)] bottom-[var(--hand-h)] flex items-center justify-center" />
      <TopBar />
      <TurnDock />
      <Hand />
      <HoverInfo />
      <HandPreview />
      <AmbushPrompt />
      <Banner />
      <Mulligan />
      <PileViewer />
      <AskPosition />
      {popup ? <ActionMenu popup={popup} /> : null}
      <Reveal />
      {inspect ? <CardPopup src={inspect} where="duel" /> : null}
      <ConfirmEnd />
      <Help />
      <GameOver />
      <DragGhost />
      <Toast />
      <ErrorToast />
      <GraphicsToggle />
    </div>
  );
}
