/**
 * ClockPort — the interface every service uses for time.
 * Business logic must never call Date.now() or new Date() directly.
 */
export interface ClockPort {
  now(): number; // Unix timestamp in milliseconds
}

/**
 * FakeClock — deterministic, manually advanceable clock for tests.
 * Start it at a fixed epoch so tests produce the same timestamps every run.
 */
export class FakeClock implements ClockPort {
  private _now: number;

  constructor(startMs: number = 1_700_000_000_000) {
    this._now = startMs;
  }

  now(): number {
    return this._now;
  }

  /** Advance the clock by the given number of milliseconds. */
  advanceMs(ms: number): void {
    if (ms < 0) throw new Error("FakeClock.advanceMs: cannot go backwards");
    this._now += ms;
  }

  /** Convenience: advance by whole seconds. */
  advanceSeconds(s: number): void {
    this.advanceMs(s * 1_000);
  }

  /** Convenience: advance by whole days. */
  advanceDays(d: number): void {
    this.advanceMs(d * 86_400_000);
  }

  /** Set the clock to an exact timestamp (use only in test setup). */
  setNow(ms: number): void {
    this._now = ms;
  }
}

/** SystemClock wraps the real wall clock. Used outside tests only. */
export class SystemClock implements ClockPort {
  now(): number {
    return Date.now();
  }
}
