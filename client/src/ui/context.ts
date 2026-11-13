import { createContext, useContext } from "react";
import type { UiActions, UiState } from "./state.js";

export interface GameUi {
  ui: UiState;
  actions: UiActions;
}

export const GameContext = createContext<GameUi | null>(null);

export function useGame(): GameUi {
  const g = useContext(GameContext);
  if (!g) throw new Error("no game context");
  return g;
}
