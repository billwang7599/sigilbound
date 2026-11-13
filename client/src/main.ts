/** Entry point: UI stores, the socket, the controller, and the board (Pixi) once the duel screen mounts. */
import "./ui/layout.js";
import { CARDS } from "@sigilbound/engine";
import { Controller } from "./game/controller.js";
import { warmArt } from "./gfx/sprites.js";
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
// The board (Pixi, its textures and the shader programs) is built while the title screen is idle, off-screen, so
// opening a duel doesn't freeze for a second while all of that compiles.
let early: Promise<BoardView> | null = null;
const buildBoard = (host: HTMLElement) => {
  // Pixi text uses the pixel font, so wait for it before drawing.
  early ??= document.fonts.load("8px Silkscreen").catch(() => undefined).then(() => BoardView.create(host));
  return early;
};
const idle = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
(idle ?? ((f: () => void) => setTimeout(f, 300)))(() => {
  void buildBoard(document.createElement("div")).then(() => warmArt(Object.keys(CARDS)));
}, { timeout: 1500 });
controller = new Controller(ui, net, async (host) => {
  const b = await buildBoard(host);
  b.mount(host);
  return b;
});
ui.app.set({ hasSaved: !!net.saved() });
mountUi(document.getElementById("ui")!, { ui, actions: controller });
net.connect();

// Dev only: lets a browser console (or a test driver) check the board against the state.
if (import.meta.env.DEV) (window as unknown as { __sigilbound: unknown }).__sigilbound = { ui, controller };
