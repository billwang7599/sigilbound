import { useGame } from "./context.js";
import { Duel } from "./screens/Duel.js";
import { Title } from "./screens/Title.js";
import { useStore } from "./useStore.js";

export function App() {
  const { ui } = useGame();
  const screen = useStore(ui.app, (a) => a.screen);
  return screen === "duel" ? <Duel /> : <Title />;
}
