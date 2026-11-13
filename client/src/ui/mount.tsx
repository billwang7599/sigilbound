import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { GameContext, type GameUi } from "./context.js";
import "./styles.css";

export function mountUi(container: HTMLElement, game: GameUi): void {
  createRoot(container).render(
    <StrictMode>
      <GameContext value={game}>
        <App />
      </GameContext>
    </StrictMode>,
  );
}
