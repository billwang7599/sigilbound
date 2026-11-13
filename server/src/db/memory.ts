/** In-memory duel storage behind the DuelStore port. Postgres replaces this later; nothing in core changes. */
import type { DuelRecord, DuelStore } from "../core/ports.js";

export class MemoryDuelStore implements DuelStore {
  private readonly duels = new Map<string, DuelRecord>();
  /** Old duels are dropped past this many, oldest first. */
  constructor(private readonly max = 500) {}

  get(id: string): DuelRecord | undefined {
    return this.duels.get(id);
  }

  save(duel: DuelRecord): void {
    this.duels.set(duel.id, duel);
    while (this.duels.size > this.max) this.duels.delete(this.duels.keys().next().value!);
  }

  delete(id: string): void {
    this.duels.delete(id);
  }

  list(): DuelRecord[] {
    return [...this.duels.values()];
  }
}
