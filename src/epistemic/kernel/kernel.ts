/**
 * M2 — EpistemicKernel: stateless admission evaluator.
 *
 * The kernel holds NO mutable state.
 * Every call to evaluate() derives run state by replaying the ledger.
 * This guarantees kernel state is always reproducible from the ledger.
 */

import type { AppendInput, EventEnvelope } from "../event-envelope.js";
import type { LedgerPort } from "../ledger.js";
import { deriveKernelState } from "./state.js";
import { admitEvent } from "./rules.js";
import type { KernelDecision } from "./types.js";

// ---------------------------------------------------------------------------
// EpistemicKernel
// ---------------------------------------------------------------------------

export class EpistemicKernel {
  private readonly ledger: LedgerPort;

  constructor(ledger: LedgerPort) {
    this.ledger = ledger;
  }

  /**
   * Evaluate whether a proposed event should be admitted.
   *
   * Derives kernel state by replaying the run's current ledger events,
   * then applies all M2 admission rules.
   *
   * No side effects. Does not append to the ledger.
   */
  evaluate(input: AppendInput): KernelDecision {
    const runEvents: readonly EventEnvelope[] = this.ledger.listRun(input.runId);
    const allEvents: readonly EventEnvelope[] = this.ledger.listAll();
    const state = deriveKernelState(input.runId, runEvents);
    return admitEvent(input, state, allEvents);
  }
}
