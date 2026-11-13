/** The bridge between game code and React. `set` every frame is fine: listeners only hear of real changes. */
export class Store<T extends object> {
  private state: T;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly initial: T) {
    this.state = initial;
  }

  /** Don't mutate the result: change it through `set`, or listeners won't hear about it. */
  get(): T {
    return this.state;
  }

  /** Shallow merge. A no-op (no re-render) if every value is unchanged. */
  set(patch: Partial<T>): void {
    let changed = false;
    for (const key in patch) {
      if (!Object.is(patch[key], this.state[key])) { changed = true; break; }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  reset(): void {
    this.set(this.initial);
  }

  /** An arrow because useSyncExternalStore calls it unbound. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}
