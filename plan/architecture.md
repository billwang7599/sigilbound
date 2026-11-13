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

## Differences from infinite-tower

| | Infinite Tower | Sigilbound |
|---|---|---|
| Clock | 60 Hz tick | None; the engine runs once per action |
| Client's copy | Full simulation, predicted and hash-checked | `viewFor(state, player)`: own hand only, no deck order |
| Netcode | Input windows, rollback, resync | Send action → receive events + new view |
| Ownership | Whole save in one wide JSON row | Each card is its own row with an owner; trades are one DB transaction |
| Session object | ~40-method `GameSession` hub | Feature modules; the session only routes |
