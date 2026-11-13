/**
 * Duels against the AI. Routes actions into the engine, runs the AI from its own view, and times Ambush windows.
 * Knows nothing about sockets, HTTP or storage: everything outside goes through ports.
 */
import {
  actors, apply, chooseAction, createGame, DECKS, eventsFor, legalActions, other, viewFor, WINDOW_MS,
  type Action, type DeckChoice, type DuelUpdate, type GameEvent, type PlayerId,
} from "@sigilbound/engine";
import type { DuelRecord, Ports } from "./ports.js";

/** How long the AI "thinks" before each kind of move, so a human can follow along. */
export const AI_DELAY = { mulligan: 400, move: 700, window: 900 };

export class DuelError extends Error {}

export class Duels {
  private readonly aiTimers = new Map<string, () => void>();
  private readonly windowTimers = new Map<string, () => void>();

  constructor(private readonly ports: Ports) {}

  /** A new duel: the human plays `deck`, the AI the other one. Who goes first is a coin flip. */
  start(deck: DeckChoice): DuelRecord {
    const aiDeck: DeckChoice = deck === "ember_rush" ? "deepwall" : "ember_rush";
    const human: PlayerId = 0;
    const { state, events } = createGame({ seed: this.ports.ids.seed(), decks: [DECKS[deck]!, DECKS[aiDeck]!] });
    const duel: DuelRecord = {
      id: this.ports.ids.duelId(), token: this.ports.ids.token(), state, human, ai: other(human),
      windowDeadline: null, createdAt: this.ports.clock.now(),
    };
    this.ports.store.save(duel);
    this.after(duel, events);
    return duel;
  }

  /** The human's current picture of a duel, or null if the duel or token is wrong. */
  resume(duelId: string, token: string): DuelUpdate | null {
    const duel = this.ports.store.get(duelId);
    if (!duel || duel.token !== token) return null;
    return this.update(duel, []);
  }

  owns(duelId: string, token: string): boolean {
    const duel = this.ports.store.get(duelId);
    return !!duel && duel.token === token;
  }

  /** The human acts. Throws DuelError or the engine's IllegalActionError. */
  act(duelId: string, action: Action): void {
    const duel = this.ports.store.get(duelId);
    if (!duel) throw new DuelError("no such duel");
    this.applyFor(duel, duel.human, action);
  }

  private applyFor(duel: DuelRecord, p: PlayerId, action: Action): void {
    const { state, events } = apply(duel.state, p, action);
    duel.state = state;
    this.after(duel, events);
  }

  /** After every change: save, set up timers, tell the human. */
  private after(duel: DuelRecord, events: GameEvent[]): void {
    const s = duel.state;
    this.clearTimer(this.windowTimers, duel.id);
    duel.windowDeadline = null;
    if (s.window) {
      duel.windowDeadline = this.ports.clock.now() + WINDOW_MS;
      if (s.window.responder === duel.human) {
        const seq = s.windowSeq;
        this.windowTimers.set(duel.id, this.ports.clock.after(WINDOW_MS, () => {
          this.windowTimers.delete(duel.id);
          const cur = this.ports.store.get(duel.id);
          // The server passes for the human when time runs out.
          if (cur?.state.window && cur.state.windowSeq === seq) this.applyFor(cur, cur.human, { type: "pass" });
        }));
      }
    }
    this.ports.store.save(duel);
    this.scheduleAi(duel);
    this.ports.link.send(duel.id, this.update(duel, events));
  }

  private scheduleAi(duel: DuelRecord): void {
    this.clearTimer(this.aiTimers, duel.id);
    const s = duel.state;
    if (!actors(s).includes(duel.ai)) return;
    const delay = s.step === "mulligan" ? AI_DELAY.mulligan : s.window ? AI_DELAY.window : AI_DELAY.move;
    this.aiTimers.set(duel.id, this.ports.clock.after(delay, () => {
      this.aiTimers.delete(duel.id);
      const cur = this.ports.store.get(duel.id);
      if (!cur || !actors(cur.state).includes(cur.ai)) return;
      // The AI sees only its own view, the same as a human would.
      const action = chooseAction(viewFor(cur.state, cur.ai));
      this.applyFor(cur, cur.ai, action);
    }));
  }

  private clearTimer(timers: Map<string, () => void>, id: string): void {
    timers.get(id)?.();
    timers.delete(id);
  }

  private update(duel: DuelRecord, events: GameEvent[]): DuelUpdate {
    const s = duel.state;
    return {
      t: "duel", duelId: duel.id, token: duel.token,
      view: viewFor(s, duel.human),
      events: eventsFor(events, duel.human),
      legal: legalActions(s, duel.human),
      window: s.window && duel.windowDeadline !== null
        ? { responder: s.window.responder, msLeft: Math.max(0, duel.windowDeadline - this.ports.clock.now()), seq: s.windowSeq }
        : null,
      aiThinking: actors(s).includes(duel.ai),
    };
  }

  /** Stop all timers (shutdown, tests). */
  dispose(): void {
    for (const cancel of [...this.aiTimers.values(), ...this.windowTimers.values()]) cancel();
    this.aiTimers.clear();
    this.windowTimers.clear();
  }
}
