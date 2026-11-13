import { useCallback } from "react";
import { useGame } from "../context.js";
import { CardPopup } from "../hud/CardPopup.js";
import { Hand } from "../hud/Hand.js";
import {
  AmbushPrompt, AskPosition, Banner, ConfirmEnd, DragGhost, ErrorToast, GameOver, Help, LogDrawer, Mulligan, PileViewer,
  TurnControls,
} from "../hud/Overlays.js";
import { useStore } from "../useStore.js";

export function Duel() {
  const { ui, actions } = useGame();
  const popup = useStore(ui.duel, (d) => d.popup);
  const boardRef = useCallback((el: HTMLDivElement | null) => actions.attachBoard(el), [actions]);
  return (
    <div className="relative h-full overflow-hidden bg-night">
      <div ref={boardRef} className="absolute inset-x-0 top-0 bottom-[132px] flex items-center justify-center" />
      <TurnControls />
      <Hand />
      <LogDrawer />
      <AmbushPrompt />
      <Banner />
      <Mulligan />
      <PileViewer />
      <AskPosition />
      {popup ? <CardPopup popup={popup} where="duel" /> : null}
      <ConfirmEnd />
      <Help />
      <GameOver />
      <DragGhost />
      <ErrorToast />
    </div>
  );
}
