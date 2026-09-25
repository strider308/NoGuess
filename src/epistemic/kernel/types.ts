/**
 * M2 — Kernel types: KernelDecision and KernelDenialCode.
 *
 * Every proposed event results in exactly one of these decisions.
 * Denial codes are stable machine-readable identifiers — not exception messages.
 */

// ---------------------------------------------------------------------------
// Denial codes
// ---------------------------------------------------------------------------

export type KernelDenialCode =
  /** Run has no RequestReceived yet — first event must be RequestReceived. */
  | "RUN_NOT_STARTED"
  /** Event is not RequestReceived but the run has no events yet. */
  | "FIRST_EVENT_MUST_BE_REQUEST_RECEIVED"
  /** A second RequestReceived was proposed for a run that already has one. */
  | "DUPLICATE_REQUEST_RECEIVED"
  /** The run is closed (RunClosed has been recorded) — no further events allowed. */
  | "RUN_CLOSED"
  /** The emitter is not authorised to emit this event type. */
  | "EMITTER_NOT_AUTHORISED"
  /** HumanDecisionRecorded referenced by DecisionSuperseded does not exist in this run. */
  | "SUPERSEDED_DECISION_NOT_FOUND"
  /** DecisionSuperseded references an event from a different run. */
  | "CROSS_RUN_SUPERSEDE"
  /** RunClosed requires a prior AcceptanceComputed in the same run. */
  | "MISSING_ACCEPTANCE_COMPUTED"
  /** ImplementationFinished requires a prior active ImplementationStarted. */
  | "NO_ACTIVE_IMPLEMENTATION"
  /** ImplementationStarted while an implementation is already active. */
  | "IMPLEMENTATION_ALREADY_ACTIVE"
  /** VerificationStarted requires a completed (Finished) implementation. */
  | "IMPLEMENTATION_NOT_COMPLETE"
  /** VerificationObserved requires a prior VerificationStarted. */
  | "VERIFICATION_NOT_STARTED"
  /** causationEventId is supplied but does not exist in the ledger at all. */
  | "UNKNOWN_CAUSATION_EVENT"
  /** causationEventId exists but belongs to a different run. */
  | "CROSS_RUN_CAUSATION"
  /** M3 — EvidenceObserved payload is missing required fields or has invalid values. */
  | "MALFORMED_EVIDENCE";

// ---------------------------------------------------------------------------
// KernelDecision
// ---------------------------------------------------------------------------

export type KernelDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly code: KernelDenialCode;
      readonly message: string;
    };

// ---------------------------------------------------------------------------
// Convenience constructors
// ---------------------------------------------------------------------------

export const allow = (): KernelDecision => ({ allowed: true });

export function deny(code: KernelDenialCode, message: string): KernelDecision {
  return { allowed: false, code, message };
}
