# Architecture (decided, not built yet)

Modeled on `../infinite-tower`, adapted for a turn-based card game with hidden information.

## Shape

- **Browser game, server first, online only.** The server holds the real state: accounts, collections, campaign saves,
  duels. One account covers campaign and PvP.
- **TypeScript everywhere, one npm-workspaces repo:**
  - `engine/`: the pure rules. `(state, action) -> { state, events }`. No I/O, no clock, no `Math.random()`
    (seeded RNG stored in state), integers only, plain-JSON state. Shared by server, client (previews) and AI.
  - `server/`: hexagonal, like infinite-tower. `core/` is the game and knows nothing about sockets, HTTP or SQL; it asks
    for outside things through interfaces in `core/ports.ts`. Outlets: `api/` (HTTP), `ws/` (game socket), `db/`
    (Postgres + Drizzle). `main.ts` is the only file that wires everything.
  - `client/`: drawing, input, feel. Never decides an outcome. Vite + React + Tailwind (same as infinite-tower) for
    HUD and overlays; **PixiJS** for rendering. Fully 2D pixel art with Stardew-style faked depth (y-sorting, shadows,
    layered tall sprites, lighting effects). Nearest-neighbour textures, integer scaling.
- **A layer-check script** fails the build when core imports an outlet, or an outlet imports another outlet.
- **Every client message** passes a Zod schema plus rate and size limits. No message can claim a result.
- **Old saves are migrated on load.**

## Ambush windows (online only)

Ambush spells (RULES.md section 9) are played on the opponent's turn, so the online duel has to stop and offer them.
The danger is Master Duel's main complaint: waiting through the other player's turn.

- **Fixed short window:** at each Ambush moment (an attack is declared, a Quick spell is cast, a Prepared spell is
  flipped), the server opens a window of about **3 seconds** for the non-turn player.
- **Open it whenever the defender has enough untapped Sigils to pay for an Ambush, whether or not they hold one.**
  Skipping it only when they have none would leak their hand. With too few Sigils, no window opens, which is fine
  because the Sigil count is already public.
- The defender can pass early; the turn player can't see why the window closed.
- **The engine models this as a state:** `pendingWindow { kind, trigger, deadline }`. The engine knows nothing about
  time. The server owns the clock and sends a `pass` action for the defender when the deadline runs out.
- Optional setting later: "auto-pass when I hold no Ambush" for players who don't care about the tell.

## Overworld (single player, client side for now)

A Stardew-style hub where you walk around as your own chibi and challenge NPCs to duels. For now it lives entirely in
the client; only the duels go through the server.

- **Saved state is in localStorage:** `sigilbound.profile` = `{ name, appearance }` and `sigilbound.world` = where
  you stood, which way you faced, the world duel in progress, and the NPC's pending after-duel line. Bad saved data is
  repaired or reset, never a crash. **Later:** move the profile and world state to the server with the account, so
  they follow you between machines and the server can check them.
- **Screens:** `title | create | world | duel` (`ui.app.screen`), switched with `ui.go(screen)`. "Enter the world"
  goes to `create` when there's no profile, otherwise to `world` (`nextScreenFromTitle` in `core/creation.ts`). Each
  screen other than title and duel handles its own keys.
- **Chibi characters** (`client/src/gfx/chibi.ts`, parts in `chibi-art.ts`): a code-drawn paper doll rendered by
  `sculpt.ts`, the same way as the monsters. `Appearance` has eight slots: body, face, eyes, hair, mouth, skin,
  hairColor, outfit. `chibiSprite(a, dir, frame)` gives a 24×32 walk sprite (4 facings, right mirrors left; frame 0
  stands, the walk loops 1, 0, 2, 0; no shadow, the renderer draws one). `chibiPortrait(a, size)` gives a square
  head-and-shoulders portrait for creation and dialogue. Plain canvases, cached, no Pixi. Creation logic (cycling,
  name rules) is pure in `core/creation.ts`.
- **The hub:** rules in `client/src/core/world.ts` (pure, tested): a 30×20 map of 16px tiles, a walkability grid,
  movement with a small hitbox at the feet and per-axis collision (diagonals slide along walls), facing, camera clamped
  to the map, who's in talk range, and the world ⇄ duel session transitions. `client/src/world/` is a thin Pixi
  scene: one fixed top-down 3/4 view, whole-number scaling, camera follows you, and depth is faked by y-sorting
  everything that stands (you, NPCs, trees, houses, fences) by its feet. The art (`world/art.ts`) is a bright
  cute-JRPG town in its own limited palette with coloured outlines, hard ground shadows baked into the ground,
  pixel-stepped water and treetop wind. One small pixel-safe pass (`world/fx.ts`, not the board's `PostFx`)
  grades colour (Low) and adds a faint hard-edged drifting cloud shadow (High); Off is the plain art.
  The dialogue box is React (`ui/screens/World.tsx`).
- **NPCs** (`client/src/data/npcs.ts`): Hina and Kit (Ember Rush), Old Bram and Suzu (Deepwall). Each has a fixed
  look, a spot, a few lines, and a line for after you win or lose. The server gives the AI whichever deck you didn't
  pick, so you always play the other deck (`playerDeckAgainst`).
- **Duel entry and return** (`client/src/world/duel.ts`, `session.ts`): `startDuel` records the NPC and your spot,
  then calls the normal `actions.newDuel`. A world duel's game-over screen offers **Return to the world** (records the
  result so the NPC comments), **Rematch** and **Menu** (forgets the world duel, goes to the title).
  `controller.leave()` sends a world duel back to the world and anything else to the title.

## Differences from infinite-tower

| | Infinite Tower | Sigilbound |
|---|---|---|
| Clock | 60 Hz tick | None; the engine runs once per action |
| Client's copy | Full simulation, predicted and hash-checked | `viewFor(state, player)`: own hand only, no deck order |
| Netcode | Input windows, rollback, resync | Send action → receive events + new view |
| Ownership | Whole save in one wide JSON row | Each card is its own row with an owner; trades are one DB transaction |
| Session object | ~40-method `GameSession` hub | Feature modules; the session only routes |
