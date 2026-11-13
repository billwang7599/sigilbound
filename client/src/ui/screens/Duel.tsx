import { useCallback } from "react";
import { useGame } from "../context.js";
import { Hand } from "../hud/Hand.js";
import { AmbushPrompt, GameOver } from "../hud/Overlays.js";
import { PlayerBar } from "../hud/PlayerBar.js";
import { SidePanel } from "../hud/SidePanel.js";
import { TurnBar } from "../hud/TurnBar.js";

export function Duel() {
  const { actions } = useGame();
  const boardRef = useCallback((el: HTMLDivElement | null) => actions.attachBoard(el), [actions]);
  return (
    <div className="relative h-full flex bg-night">
      <div className="flex-1 min-w-0 flex flex-col">
        <PlayerBar side="opp" />
        <div ref={boardRef} className="flex-1 min-h-0 flex items-center justify-center py-1" />
        <TurnBar />
        <PlayerBar side="me" />
        <Hand />
      </div>
      <SidePanel />
      <AmbushPrompt />
      <GameOver />
    </div>
  );
}
