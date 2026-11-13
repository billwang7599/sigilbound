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

- **Drag** a hand card onto the board: a monster onto one of your lanes (then pick Attack or Defense on the slot), a
  Prepared spell onto a spell slot, a targeted spell onto its target, any other spell anywhere on the lanes, or any card
  onto your **Sigil row** (left) to bind it. Legal places glow while you drag.
- **Drag** one of your monsters onto an enemy (or the rival's corner, top right) to attack, even from the Main step,
  or onto a lane next to it to move. Right-click your monster to switch its position.
- **Click** any card (hand, board, Sigils, deck or discard lists) for a big readable popup. Hover the underlined
  keywords for what they mean (all definitions live in `client/src/core/keywords.ts`). A hand card's popup offers
  lane and position buttons and Bind; your monster's popup offers Attack, Switch position, Crest and Move.
- **Piles:** your deck (top-left of your Sigil row) opens a list of what's left in it, grouped and sorted by cost,
  never in draw order. Discard piles (right) list their cards.
- **Keyboard:** ← → along the hand, 1–9 opens a card, ↑/Tab to your monsters, Enter opens, inside a popup 1/2/3 lane,
  A/D position, B bind, Enter confirm, Esc back. E ends the turn, P passes an Ambush window, L shows the log, ? lists
  everything.

Lanes are plain for now: fields are off by default (`createGame({ fields: true })` turns them back on).

Dev notes: duels live in memory, so restarting the server ends them. If file changes don't hot-reload, run with
`VITE_POLL=1`; `VITE_CACHE_DIR` moves Vite's cache if `node_modules` is read-only.
