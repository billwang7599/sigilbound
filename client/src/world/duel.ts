/**
 * World ⇄ duel glue. A duel with an NPC goes through the normal duel path (actions.newDuel: the server starts it
 * and the controller switches to the duel screen); the world session remembers who and where, so the game-over
 * screen can offer "Return to the world" and the NPC can comment on the result.
 */
import type { Dir, Vec } from "../core/world.js";
import { npcById, playerDeckAgainst, type Npc } from "../data/npcs.js";
import type { UiActions, UiState } from "../ui/state.js";
import { session } from "./session.js";

/** Challenge an NPC: you play the deck they don't. */
export function startDuel(actions: Pick<UiActions, "newDuel">, npc: Npc, at: { pos: Vec; facing: Dir }): void {
  session.beginDuel(npc.id, at.pos, at.facing);
  actions.newDuel(playerDeckAgainst(npc));
}

/** The NPC of the duel in progress, if it came from the world. */
export function worldDuelNpc(): Npc | null {
  const d = session.get().duel;
  return d ? npcById(d.npcId) ?? null : null;
}

/** Game over → back to where you stood, and the NPC says something about how it went. */
export function returnToWorld(ui: Pick<UiState, "go">, actions: Pick<UiActions, "leave">, won: boolean): void {
  session.endDuel(won);
  actions.leave();
  ui.go("world");
}

/** Same NPC again. */
export function rematch(actions: Pick<UiActions, "newDuel">): void {
  const npc = worldDuelNpc();
  if (npc) actions.newDuel(playerDeckAgainst(npc));
}

/** Out to the title instead: forget the world duel (your spot in the world stays). */
export function leaveToTitle(actions: Pick<UiActions, "leave">): void {
  session.abandonDuel();
  actions.leave();
}
