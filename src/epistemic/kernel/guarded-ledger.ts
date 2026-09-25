/**
 * M2 — KernelGuardedLedger: the only public path for appending events.
 *
 * Flow:
 *   candidate event
 *   → kernel.evaluate(...)
 *   → DENY: throw KernelDenialError (event is NOT appended)
 *   → ALLOW: append through the underlying M1 LedgerPort
 *
 * The underlying M1 ledger remains accessible independently
 * for integrity verification and read operations.
 * No bypass path exists for privileged events.
 */

import type { EventType } from "../events.js";
import type { AppendInput, EventEnvelope } from "../event-envelope.js";
import type { LedgerPort } from "../ledger.js";
import { EpistemicKernel } from "./kernel.js";
import type { KernelDenialCode } from "./types.js";

// ---------------------------------------------------------------------------
// KernelDenialError — thrown when an event is rejected
// ---------------------------------------------------------------------------

export class KernelDenialError extends Error {
  readonly code: KernelDenialCode;

  constructor(code: KernelDenialCode, message: string) {
    super(message);
    this.name = "KernelDenialError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// KernelGuardedLedger
// ---------------------------------------------------------------------------

export class KernelGuardedLedger {
  private readonly kernel: EpistemicKernel;
  private readonly ledger: LedgerPort;

  constructor(ledger: LedgerPort) {
    this.ledger = ledger;
    this.kernel = new EpistemicKernel(ledger);
  }

  /**
   * Evaluate the proposed event through the kernel.
   * ALLOW → append to ledger and return the stored envelope.
   * DENY  → throw KernelDenialError; nothing is written to the ledger.
   */
  append<T extends EventType>(input: AppendInput<T>): EventEnvelope<T> {
    const decision = this.kernel.evaluate(input);

    if (!decision.allowed) {
      throw new KernelDenialError(decision.code, decision.message);
    }

    return this.ledger.append(input);
  }

  // -------------------------------------------------------------------------
  // Delegate read-only operations to the underlying ledger
  // -------------------------------------------------------------------------

  getBySequence(sequence: number): EventEnvelope | undefined {
    return this.ledger.getBySequence(sequence);
  }

  getByEventId(eventId: string): EventEnvelope | undefined {
    return this.ledger.getByEventId(eventId);
  }

  listRun(runId: string): readonly EventEnvelope[] {
    return this.ledger.listRun(runId);
  }

  listAll(): readonly EventEnvelope[] {
    return this.ledger.listAll();
  }

  verifyIntegrity() {
    return this.ledger.verifyIntegrity();
  }

  close(): void {
    this.ledger.close();
  }

  /**
   * Expose the underlying M1 ledger for integrity tests and replay.
   * This is read-only usage only — callers must not treat it as a bypass path.
   */
  get underlyingLedger(): LedgerPort {
    return this.ledger;
  }
}
