import { useGame } from "./context.js";
import { CardPopup } from "./hud/CardPopup.js";
import { DeckList } from "./hud/Overlays.js";
import { Create } from "./screens/Create.js";
import { Duel } from "./screens/Duel.js";
import { Title } from "./screens/Title.js";
import { World } from "./screens/World.js";
import { useStore } from "./useStore.js";

export function App() {
  const { ui } = useGame();
  const screen = useStore(ui.app, (a) => a.screen);
  const popup = useStore(ui.app, (a) => a.popup);
  if (screen === "duel") return <Duel />;
  if (screen === "create") return <Create />;
  if (screen === "world") return <World />;
  return (
    <div className="relative h-full">
      <Title />
      <DeckList />
      {popup ? <CardPopup src={popup.src} where="app" /> : null}
    </div>
  );
}
