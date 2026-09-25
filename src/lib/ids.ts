/**
 * IdFactory — deterministic, sequential ID generation.
 *
 * IDs are produced per namespace as `<namespace>-<counter>`.
 * The counter starts at 1 and increments by 1 each call.
 *
 * Business logic and services must never call crypto.randomUUID() or
 * Math.random() for IDs. Always use an injected IdFactory.
 */
export class IdFactory {
  private counters = new Map<string, number>();

  /** Return the next ID for the given namespace, e.g. "tenant" → "tenant-1". */
  next(namespace: string): string {
    const current = this.counters.get(namespace) ?? 0;
    const next = current + 1;
    this.counters.set(namespace, next);
    return `${namespace}-${next}`;
  }

  /**
   * Reset a namespace counter back to zero.
   * Only use in test setup to get reproducible ID sequences.
   */
  reset(namespace: string): void {
    this.counters.delete(namespace);
  }

  /** Reset all counters. Use in test setup for a clean slate. */
  resetAll(): void {
    this.counters.clear();
  }
}
