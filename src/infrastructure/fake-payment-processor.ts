/**
 * FakePaymentProcessor — deterministic scripted payment outcomes.
 *
 * Outcomes are keyed by a stable fixture identifier (the payment's
 * idempotencyKey). This makes test behavior explicit and prevents
 * accidental coupling between payment amounts and benchmark results.
 *
 * If no script is registered for a given key, the processor succeeds
 * by default (safe baseline).
 *
 * Usage:
 *   const processor = new FakePaymentProcessor();
 *   processor.script("idem-key-1", { outcome: "TRANSIENT_FAILURE" });
 *   processor.script("idem-key-2", { outcome: "HARD_DECLINE" });
 *   // All other keys → SUCCESS
 */
import type { FailureKind } from "../domain/payment.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProcessorOutcome =
  | { outcome: "SUCCESS" }
  | { outcome: "TRANSIENT_FAILURE" }
  | { outcome: "HARD_DECLINE" };

export interface ProcessorResult {
  success: boolean;
  failureKind?: FailureKind;
  processorRef: string; // opaque reference returned by the fake processor
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

export class FakePaymentProcessor {
  private readonly scripts = new Map<string, ProcessorOutcome>();
  private callCount = 0;

  /**
   * Register a scripted outcome for a specific idempotency key.
   * Call before the test scenario runs.
   */
  script(idempotencyKey: string, outcome: ProcessorOutcome): void {
    this.scripts.set(idempotencyKey, outcome);
  }

  /** Remove a scripted outcome (revert to default SUCCESS). */
  clearScript(idempotencyKey: string): void {
    this.scripts.delete(idempotencyKey);
  }

  /** Remove all scripted outcomes. */
  clearAll(): void {
    this.scripts.clear();
    this.callCount = 0;
  }

  /**
   * Process a payment attempt.
   * The outcome is determined entirely by the registered script for the key.
   * No network I/O is performed.
   */
  process(idempotencyKey: string): ProcessorResult {
    this.callCount += 1;
    const ref = `proc-ref-${this.callCount}`;
    const script = this.scripts.get(idempotencyKey) ?? { outcome: "SUCCESS" };

    switch (script.outcome) {
      case "SUCCESS":
        return { success: true, processorRef: ref };
      case "TRANSIENT_FAILURE":
        return { success: false, failureKind: "TRANSIENT", processorRef: ref };
      case "HARD_DECLINE":
        return { success: false, failureKind: "HARD_DECLINE", processorRef: ref };
    }
  }

  /** Total number of process() calls made. */
  get totalCalls(): number {
    return this.callCount;
  }
}
