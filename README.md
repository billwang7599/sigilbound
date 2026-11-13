# Sigilbound

A monster card game: rules in [RULES.md](RULES.md), architecture in [plan/architecture.md](plan/architecture.md).

## Run it

```sh
npm install
npm run dev        # game server on :8787 + Vite client on :5173
```

Open http://localhost:5173, pick a deck, and play the AI (it plays the other deck).

- `npm test`: engine rules tests, server duel tests, and 100 AI-vs-AI games (prints average length)
- `npm run typecheck`: all workspaces plus the server layer check
- `npm run sim -- 200`: more AI-vs-AI games with a win/length summary

## Layout

- `engine/`: pure rules, `apply(state, player, action) -> { state, events }`, `legalActions`, `viewFor`, the AI, and
  all card data in `engine/src/cards.ts`.
- `server/`: hexagonal. `core/` (duels, AI turns, Ambush timers) talks to the world only through `core/ports.ts`.
  Outlets: `ws/` (game socket, Zod-validated), `api/` (health), `db/` (in-memory store for now). `main.ts` wires them.
- `client/`: Vite + React 19 + Tailwind 4 for the HUD, PixiJS 8 for the board. The board is drawn at 336×216 and
  scaled by a whole number with nearest sampling (shrinking below 1× only when the window is tiny). All art is generated in code (`client/src/gfx/`). Palette in `gfx/palette.ts` (48 colours), monster and
  spell shapes in `gfx/art.ts` (swap any for a PNG via `PNG_ART`), card frames in `gfx/frames.ts`, the board in
  `gfx/board-art.ts`. The **Graphics** toggle (bottom left: Off / Low / High, saved) adds a lighting/post-processing
  layer (`client/src/visuals/shaders/`) at native resolution; Off is the plain pixel art.

## Playing

- **Select** a hand card (click it, or press its number): it lifts and a small menu opens beside it. The places it can
  go glow on the board: click one (or press 1/2/3). A monster then asks Attack or Defense right on the slot. Bind it
  with **B**, the menu button, or by clicking your glowing **Sigil row**. Nothing docks on the right side.
- **Drag** works too: drop a card on a glowing place (a near miss snaps to the closest legal one).
- **Your monsters:** click one and its menu (Attack, Switch, Move, Crest) opens beside it while its targets glow red;
  click a target to attack, even from the Main step. Or drag it onto the target. Right-click switches position.
- **Reading cards:** hover a board card for its numbers and every keyword spelled out (hover its badges too); hover a
  hand card a moment to see it big; press **I** or **Space** (or "Read card") for the full card beside it. Keywords
  have tooltips everywhere (hand, board, menus, deck and discard lists). Definitions: `client/src/core/keywords.ts`.
- **The rival's plays** are revealed big over the board with a caption ("Rival casts Spark → Emberhorn destroyed")
  and beams to whatever they hit; face-down sets and binds stay hidden. Click or any key skips a reveal.
- **Skipping the rival's turn** (bottom left while it plays): **S**/→ skip this move, **F** fast-forward until you
  need to decide, **Shift+F**/**End** skip to the end of its turn. Every mode still stops for your Ambush windows, and
  a toast sums up what it did. "Auto-skip rival turns" and AI speed are saved settings. The client also tells the
  server to drop the AI's thinking delay (`{ t: "hurry" }`) while you skip.
- **Log:** the strip in the top bar shows the latest play; click it (or **L**) for the full list; click a line to see
  its card. **Piles:** your deck (top-left of your Sigil row) lists what's left, never in draw order; discards list
  their cards. **?** lists every key.

Lanes are plain for now: fields are off by default (`createGame({ fields: true })` turns them back on).

Dev notes: duels live in memory, so restarting the server ends them. If file changes don't hot-reload, run with
`VITE_POLL=1`; `VITE_CACHE_DIR` moves Vite's cache if `node_modules` is read-only.
