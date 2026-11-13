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
- `client/`: Vite + React 19 + Tailwind 4 for the HUD, PixiJS 8 for the board. The board is drawn at 240×216 and
  scaled by a whole number with nearest sampling. All art is generated in code (`client/src/gfx/`).

## Playing

Click a card in your hand or a monster/spell on the board. The side panel lists what it can do, and the slots it
can reach glow; click a glowing slot or a menu item. To attack: **Attack ⚔**, click your monster, then its target (click the rival's
bar for a direct hit). When the rival attacks and you have untapped Sigils, an Ambush prompt appears for 3 seconds.

Dev notes: duels live in memory, so restarting the server ends them. If file changes don't hot-reload, run with
`VITE_POLL=1`; `VITE_CACHE_DIR` moves Vite's cache if `node_modules` is read-only.
