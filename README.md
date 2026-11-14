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
- `npm run balance -- 500 [lanes]`: every deck matchup with fixed seeds: game length, win rates, first-player wins,
  spells per game, Guard use and stalls
- `npx tsx engine/scripts/experiment.ts 300 3 '{"cards":{"pebblekin":{"def":4}}}'`: the same report with card or deck
  tweaks patched in memory, for trying balance ideas without editing card data
- `npx tsx engine/scripts/diag.ts 500`: per-spell held / used / bound-as-Sigil counts

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
  go glow on the board: click one. A monster then asks Attack or Defense right on the slot. Bind it
  with **B**, the menu button, or by clicking your glowing **Sigil row**. Nothing docks on the right side.
- **Keyboard only** works end to end (logic in `client/src/core/focus.ts`):
  - **←/→** move along your hand; **↑/↓** (or Tab) move up to your spell row, your monsters, then the rival's
    monsters, and back down to the hand; ↓ from the hand is the Deck button. A white ring shows the focus at every step.
  - **1–9** or **Space/Enter** selects the focused card and opens its menu; the same key again unselects it.
  - In a menu, **↑/↓** (or Tab) move a white cursor over its options. **←/→** select the previous/next hand card and
    open its menu (stopping at the ends; on a selected monster, your next monster that can act), except while the
    cursor is on a glowing lane or target, where ←/→ step between those legal places only. **Space/Enter** does the
    highlighted option; **Esc** backs up one step.
  - On your monster, Space opens its menu (Attack, Switch…); on a rival monster it shows the card. The rival's
    face-down cards are never focusable. On the rival's turn you can still move around and read cards; only the skip
    keys act. Focus survives animations and turn changes (it moves to the nearest card if its card leaves).
- **Your Crest** (your once-per-turn skill, 2 Sigils): the button just above your LP plaque, in the Crest's colour
  with its cost. It glows when you can use it, is greyed out when you can't, and says USED after you've used it this
  turn. Hover it (or arrow-focus it: ↓ from your hand is the Deck button, → from there is the Crest) to see what it does
  and, if it can't be used, why. Click it or press **C**: Tide happens at once; Ember and Stone light your monsters
  (click one, or ←/→ and Space); Gale lights the monsters that can move, then where it goes. Esc, C again, or a click
  anywhere else cancels. Either side's Crest use flashes its badge with a caption ("Rival: Stone crest · Left monster
  +2 DEF") and goes in the log. The rival's Crest is a read-only badge under its LP plaque, with the same hover text.
  Logic in `client/src/core/crest.ts`.
- **Click outside** any open popup closes it, the same as Esc, and that click doesn't also press what's under it: a
  card's menu, the log, a Crest pick, and the card reader, deck/discard lists, help and confirmations (those have a
  dimmed backdrop). Clicking another hand card or your monster switches the selection, and drags still work. The rules
  are in `client/src/core/dismiss.ts`.
- **Drag** works too: drop a card on a glowing place (a near miss snaps to the closest legal one).
- **Your monsters:** click one and its menu (Attack, Switch, Move, Crest) opens beside it while its targets glow red;
  click a target to attack, even from the Main step. Or drag it onto the target. Right-click switches position.
- **Reading cards:** hover a board card for its numbers and every keyword spelled out (hover its badges too); hover a
  hand card a moment to see it big; press **I** (or "Read card") for the full card beside it. Keywords
  have tooltips everywhere (hand, board, menus, deck and discard lists). Definitions: `client/src/core/keywords.ts`.
- **The rival's plays** are revealed big over the board with a caption ("Rival casts Spark → Emberhorn destroyed")
  and beams to whatever they hit; face-down sets and binds stay hidden. Click or any key skips a reveal.
- **Skipping the rival's turn** (bottom left while it plays): **S**/→ skip this move, **F** fast-forward until you
  need to decide, **Shift+F**/**End** skip to the end of its turn. Every mode still stops for your Ambush windows, and
  a toast sums up what it did. "Auto-skip rival turns" and AI speed are saved settings. The client also tells the
  server to drop the AI's thinking delay (`{ t: "hurry" }`) while you skip.
- **Log:** the strip in the top bar shows the latest play; click it (or **L**) for the full list; click a line to see
  its card. **Your deck:** the **Deck N** button (bottom left, always there), **V**, ↓ below your hand, or the
  DECK pile under your Sigil row (it glows on hover) opens what's left: a count, monsters vs spells, cards by cost,
  then every card of your deck grouped ×N (never in draw order), with the ones you've run out of dimmed. The
  rival's deck shows only its count. Discards list their cards. **?** lists every key.

## The world

On the title screen, **Enter the world** opens character creation the first time (later it goes straight in, and
**Edit character** reopens creation). Quick duels against the AI are still there. Your character and spot are saved
in the browser.

- **Character creation:** **↑/↓** or **W/S** picks a row, **←/→** or **A/D** changes it, **R** randomizes, **N** jumps
  to the name (1–16 letters, numbers, spaces, `'-_`), **Enter** goes into the world, **Esc** goes back. Everything is
  clickable too.
- **In the world:** **Arrows/WASD** walk. Near someone, **E**, **Space** or **Enter** talks and moves to the next
  line. On the last line, the arrows or **Tab** switch between **Duel!** and **Not now** and **Enter** picks (or press
  **1** / **2**). **Esc** closes the dialogue, or goes back to the title.
- **After a world duel:** **Return to the world** puts you back where you stood and the NPC comments on the result;
  **Rematch** plays them again; **Menu** goes to the title.
- The **Graphics** setting (Off / Low / High) also lights the world.
- Chibi preview: `npm run art:chibi` writes `client/art-preview/chibi-sheet.png`; in dev, `/?chibi` shows the same
  sheet.

Lanes are plain for now: fields are off by default (`createGame({ fields: true })` turns them back on).

Dev notes: duels live in memory, so restarting the server ends them. If file changes don't hot-reload, run with
`VITE_POLL=1`; `VITE_CACHE_DIR` moves Vite's cache if `node_modules` is read-only.
