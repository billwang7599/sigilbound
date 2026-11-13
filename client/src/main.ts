/** Entry point: UI stores, the socket, the controller, and the board (Pixi) once the duel screen mounts. */
import { Controller } from "./game/controller.js";
import { Net } from "./net/net.js";
import { mountUi } from "./ui/mount.js";
import { UiState } from "./ui/state.js";
import { BoardView } from "./visuals/board.js";

const ui = new UiState();
let controller: Controller;
const net = new Net({
  onUpdate: (u) => controller.onUpdate(u),
  onError: (m) => controller.onError(m),
  onStatus: (c) => controller.onStatus(c),
});
controller = new Controller(ui, net, async (host, c) => {
  // Pixi text uses the pixel font, so wait for it before drawing.
  await document.fonts.load("8px Silkscreen").catch(() => undefined);
  return BoardView.create(host, { clickSlot: (s) => c.clickSlot(s), hover: (h) => c.hover(h) });
});
ui.app.set({ hasSaved: !!net.saved() });
mountUi(document.getElementById("ui")!, { ui, actions: controller });
net.connect();
