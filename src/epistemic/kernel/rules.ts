/**
 * M2/M3 — Admission rules and emitter authority table.
 *
 * This module is the single auditable location for all M2/M3 invariants.
 * Rules are evaluated deterministically against replay-derived state.
 * No mutable side effects; no network; no randomness.
 */

import type {
  EventType,
  AuthorityClass,
  EpistemicState,
} from "../events.js";
import type {
  AppendInput,
  Emitter,
  EventEnvelope,
} from "../event-envelope.js";
import type { EvidenceObservedPayload } from "../events.js";
import type { KernelRunState } from "./state.js";
import { allow, deny } from "./types.js";
import type { KernelDecision, KernelDenialCode } from "./types.js";

// ---------------------------------------------------------------------------
// Emitter authority table
//
// Maps each EventType to the set of Emitters that are ALLOWED to emit it.
// Absence from this map means "no M2-specific restriction" — open to the
// declared emitter set (still subject to run-lifecycle rules below).
// ---------------------------------------------------------------------------

const EMITTER_AUTHORITY: Partial<Record<EventType, ReadonlySet<Emitter>>> = {
  // Human control-plane events — HUMAN only
  HumanDecisionRecorded: new Set<Emitter>(["HUMAN"]),
  DecisionSuperseded: new Set<Emitter>(["HUMAN"]),

  // Capability control-plane events — SYSTEM or KERNEL only (not BOB)
  CapabilityGranted: new Set<Emitter>(["SYSTEM", "KERNEL"]),
  CapabilityDenied: new Set<Emitter>(["SYSTEM", "KERNEL"]),
  CapabilityExpired: new Set<Emitter>(["SYSTEM", "KERNEL"]),

  // Acceptance — KERNEL only for M2
  AcceptanceComputed: new Set<Emitter>(["KERNEL"]),

  // Run closure — KERNEL only
  RunClosed: new Set<Emitter>(["KERNEL"]),

  // Hidden evaluator — EVALUATOR only
  HiddenIntentCheckObserved: new Set<Emitter>(["EVALUATOR"]),

  // M3 — EvidenceConflictDetected: KERNEL only
  EvidenceConflictDetected: new Set<Emitter>(["KERNEL"]),

  // M3 — EvidenceObserved: only BOB and SYSTEM may attest evidence directly.
  //      HUMAN uses HumanDecisionRecorded.
  //      KERNEL uses EvidenceConflictDetected or other kernel events.
  //      EVALUATOR uses HiddenIntentCheckObserved.
  EvidenceObserved: new Set<Emitter>(["BOB", "SYSTEM"]),

  // M4-M6 — Intent control-plane events — KERNEL only
  // BOB proposes interpretations; KERNEL records forks, classifications, clarifications.
  SemanticForkDetected: new Set<Emitter>(["KERNEL"]),
  AmbiguityClassified: new Set<Emitter>(["KERNEL"]),
  ClarificationRequested: new Set<Emitter>(["KERNEL"]),
};

// ---------------------------------------------------------------------------
// M3 — Valid canonical sets for runtime validation
// ---------------------------------------------------------------------------

const VALID_AUTHORITY_CLASSES: ReadonlySet<AuthorityClass> = new Set<AuthorityClass>([
  "HUMAN_RESOLVED",
  "EXECUTABLE_CONTRACT",
  "VERSIONED_POLICY",
  "RUNTIME_OBSERVED",
  "IMPLEMENTATION",
  "DOCUMENTATION",
  "MODEL_INFERENCE",
]);

const VALID_EPISTEMIC_STATES: ReadonlySet<EpistemicState> = new Set<EpistemicState>([
  "EXPLICIT",
  "REPO_DERIVED",
  "RUNTIME_OBSERVED",
  "HUMAN_RESOLVED",
  "INFERRED",
  "AMBIGUOUS",
  "CONFLICTING",
  "UNKNOWN",
  "EXTERNAL_DECISION",
]);

// ---------------------------------------------------------------------------
// M3 — Attestation constraints per emitter
//
// BOB:    MODEL_INFERENCE / INFERRED only.
// SYSTEM: grounded authority classes only; restricted epistemic states.
//         Must NOT attest derived states (AMBIGUOUS, CONFLICTING, UNKNOWN,
//         EXTERNAL_DECISION, HUMAN_RESOLVED, INFERRED).
// ---------------------------------------------------------------------------

const SYSTEM_ALLOWED_AUTHORITY: ReadonlySet<AuthorityClass> = new Set<AuthorityClass>([
  "EXECUTABLE_CONTRACT",
  "VERSIONED_POLICY",
  "RUNTIME_OBSERVED",
  "IMPLEMENTATION",
  "DOCUMENTATION",
]);

const SYSTEM_ALLOWED_EPISTEMIC: ReadonlySet<EpistemicState> = new Set<EpistemicState>([
  "EXPLICIT",
  "REPO_DERIVED",
  "RUNTIME_OBSERVED",
]);

// ---------------------------------------------------------------------------
// M3 — Runtime field validation (fail-closed: rejects unknown/absent fields)
// ---------------------------------------------------------------------------

function validateEvidenceObservedFields(
  payload: EvidenceObservedPayload
): KernelDecision {
  // evidenceId: non-empty string
  if (typeof payload.evidenceId !== "string" || payload.evidenceId.trim() === "") {
    return deny(
      "MALFORMED_EVIDENCE",
      `EvidenceObserved.evidenceId must be a non-empty string.`
    );
  }
  // claimKey: non-empty string
  if (typeof payload.claimKey !== "string" || payload.claimKey.trim() === "") {
    return deny(
      "MALFORMED_EVIDENCE",
      `EvidenceObserved.claimKey must be a non-empty string.`
    );
  }
  // sourceRef: non-empty string
  if (typeof payload.sourceRef !== "string" || payload.sourceRef.trim() === "") {
    return deny(
      "MALFORMED_EVIDENCE",
      `EvidenceObserved.sourceRef must be a non-empty string.`
    );
  }
  // authorityClass: must be a valid AuthorityClass
  if (!VALID_AUTHORITY_CLASSES.has(payload.authorityClass as AuthorityClass)) {
    return deny(
      "MALFORMED_EVIDENCE",
      `EvidenceObserved.authorityClass "${payload.authorityClass}" is not a valid AuthorityClass.`
    );
  }
  // epistemicState: must be a valid EpistemicState
  if (!VALID_EPISTEMIC_STATES.has(payload.epistemicState as EpistemicState)) {
    return deny(
      "MALFORMED_EVIDENCE",
      `EvidenceObserved.epistemicState "${payload.epistemicState}" is not a valid EpistemicState.`
    );
  }
  // value: must not be undefined (null, string, number, boolean, array, object are all valid)
  if (payload.value === undefined) {
    return deny(
      "MALFORMED_EVIDENCE",
      `EvidenceObserved.value must be present (null, string, number, boolean, array, or object).`
    );
  }
  // confidence: if supplied, must be a finite number in [0,1]
  if (payload.confidence !== undefined) {
    if (
      typeof payload.confidence !== "number" ||
      !Number.isFinite(payload.confidence) ||
      payload.confidence < 0 ||
      payload.confidence > 1
    ) {
      return deny(
        "MALFORMED_EVIDENCE",
        `EvidenceObserved.confidence must be a finite number in [0,1], got ${payload.confidence}.`
      );
    }
  }
  return allow();
}

// ---------------------------------------------------------------------------
// M3 — Attestation boundary check per emitter
// ---------------------------------------------------------------------------

function checkEvidenceObservedAttestation(
  emitter: Emitter,
  payload: EvidenceObservedPayload
): KernelDecision {
  if (emitter === "BOB") {
    // BOB: only MODEL_INFERENCE / INFERRED
    if (payload.authorityClass !== "MODEL_INFERENCE") {
      return deny(
        "EMITTER_NOT_AUTHORISED" as KernelDenialCode,
        `BOB may not directly attest authorityClass "${payload.authorityClass}". ` +
          `BOB-emitted EvidenceObserved must use authorityClass "MODEL_INFERENCE".`
      );
    }
    if (payload.epistemicState !== "INFERRED") {
      return deny(
        "EMITTER_NOT_AUTHORISED" as KernelDenialCode,
        `BOB may not claim epistemicState "${payload.epistemicState}" in EvidenceObserved. ` +
          `BOB-emitted evidence must use epistemicState "INFERRED".`
      );
    }
    return allow();
  }

  if (emitter === "SYSTEM") {
    // SYSTEM: only grounded authority classes
    if (!SYSTEM_ALLOWED_AUTHORITY.has(payload.authorityClass)) {
      return deny(
        "EMITTER_NOT_AUTHORISED" as KernelDenialCode,
        `SYSTEM may not attest authorityClass "${payload.authorityClass}" in EvidenceObserved. ` +
          `SYSTEM may only use: ${[...SYSTEM_ALLOWED_AUTHORITY].join(", ")}.`
      );
    }
    // SYSTEM: only grounded epistemic states
    if (!SYSTEM_ALLOWED_EPISTEMIC.has(payload.epistemicState)) {
      return deny(
        "EMITTER_NOT_AUTHORISED" as KernelDenialCode,
        `SYSTEM may not claim epistemicState "${payload.epistemicState}" in EvidenceObserved. ` +
          `SYSTEM may only use: ${[...SYSTEM_ALLOWED_EPISTEMIC].join(", ")}.`
      );
    }
    return allow();
  }

  // All other emitters (HUMAN, KERNEL, EVALUATOR) are already blocked by
  // the EMITTER_AUTHORITY table above. This is a defence-in-depth fallback.
  return deny(
    "EMITTER_NOT_AUTHORISED" as KernelDenialCode,
    `Emitter "${emitter}" is not authorised to emit EvidenceObserved.`
  );
}

// ---------------------------------------------------------------------------
// admitEvent — the single entry point for all admission checks
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a proposed event should be admitted.
 *
 * @param input      The proposed event (not yet appended).
 * @param state      Replay-derived state for the run referenced by input.runId.
 * @param allEvents  All events in the ledger (for cross-run causation checks).
 */
export function admitEvent(
  input: AppendInput,
  state: KernelRunState,
  allEvents: readonly EventEnvelope[]
): KernelDecision {
  // -------------------------------------------------------------------------
  // 1. RUN CLOSED — terminal; reject everything
  // -------------------------------------------------------------------------
  if (state.closed) {
    return deny("RUN_CLOSED", `Run ${input.runId} is closed. No further events may be admitted.`);
  }

  // -------------------------------------------------------------------------
  // 2. RUN START invariant
  //    - First event must be RequestReceived
  //    - Only one RequestReceived per run
  // -------------------------------------------------------------------------
  if (!state.requestReceived) {
    if (input.type !== "RequestReceived") {
      return deny(
        "FIRST_EVENT_MUST_BE_REQUEST_RECEIVED",
        `Run ${input.runId} has no RequestReceived yet. First event must be RequestReceived, got ${input.type}.`
      );
    }
    // Proposing RequestReceived on a fresh run — fall through to emitter check.
  } else {
    // Run already has a RequestReceived.
    if (input.type === "RequestReceived") {
      return deny(
        "DUPLICATE_REQUEST_RECEIVED",
        `Run ${input.runId} already has a RequestReceived. Only one is allowed per run.`
      );
    }
  }

  // -------------------------------------------------------------------------
  // 3. Emitter authority check
  // -------------------------------------------------------------------------
  const authorised = EMITTER_AUTHORITY[input.type];
  if (authorised !== undefined && !authorised.has(input.emitter)) {
    return deny(
      "EMITTER_NOT_AUTHORISED",
      `Emitter ${input.emitter} is not authorised to emit ${input.type}. ` +
        `Authorised emitters: ${[...authorised].join(", ")}.`
    );
  }

  // -------------------------------------------------------------------------
  // M3 — EvidenceObserved: structural validation then attestation boundary
  // -------------------------------------------------------------------------
  if (input.type === "EvidenceObserved") {
    const p = input.payload as EvidenceObservedPayload;
    const fieldCheck = validateEvidenceObservedFields(p);
    if (!fieldCheck.allowed) return fieldCheck;
    const attestationCheck = checkEvidenceObservedAttestation(input.emitter, p);
    if (!attestationCheck.allowed) return attestationCheck;
  }

  // -------------------------------------------------------------------------
  // 4. DecisionSuperseded — referenced decision must exist in the same run
  // -------------------------------------------------------------------------
  if (input.type === "DecisionSuperseded") {
    const p = input.payload as { decisionId: string; supersededBy: string };
    const decisionId = p.decisionId;

    // Check the decisionId is known in this run's active or already-superseded set.
    const knownInRun =
      state.activeDecisionIds.has(decisionId) ||
      state.supersededDecisionIds.has(decisionId);

    if (!knownInRun) {
      // Could be from another run — check all events.
      const foreignEvent = findDecisionEvent(decisionId, allEvents, input.runId);
      if (foreignEvent !== undefined) {
        return deny(
          "CROSS_RUN_SUPERSEDE",
          `DecisionSuperseded references decisionId "${decisionId}" which belongs to run ${foreignEvent.runId}, not ${input.runId}.`
        );
      }
      return deny(
        "SUPERSEDED_DECISION_NOT_FOUND",
        `DecisionSuperseded references unknown decisionId "${decisionId}" in run ${input.runId}.`
      );
    }
  }

  // -------------------------------------------------------------------------
  // 5. AcceptanceComputed prerequisite (M2: just guard emitter; no algorithm)
  //    Already handled by EMITTER_AUTHORITY above.
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // 6. RunClosed — requires prior AcceptanceComputed
  // -------------------------------------------------------------------------
  if (input.type === "RunClosed") {
    if (!state.acceptanceComputed) {
      return deny(
        "MISSING_ACCEPTANCE_COMPUTED",
        `RunClosed requires a prior AcceptanceComputed event in run ${input.runId}.`
      );
    }
  }

  // -------------------------------------------------------------------------
  // 7. Implementation lifecycle
  // -------------------------------------------------------------------------
  if (input.type === "ImplementationStarted") {
    if (state.implementationActive) {
      return deny(
        "IMPLEMENTATION_ALREADY_ACTIVE",
        `Run ${input.runId} already has an active ImplementationStarted. ImplementationFinished must be recorded first.`
      );
    }
  }

  if (input.type === "ImplementationFinished") {
    if (!state.implementationActive) {
      return deny(
        "NO_ACTIVE_IMPLEMENTATION",
        `Run ${input.runId} has no active ImplementationStarted. ImplementationFinished cannot be recorded.`
      );
    }
  }

  // -------------------------------------------------------------------------
  // 8. Verification lifecycle
  // -------------------------------------------------------------------------
  if (input.type === "VerificationStarted") {
    if (!state.implementationFinished) {
      return deny(
        "IMPLEMENTATION_NOT_COMPLETE",
        `Run ${input.runId} has no completed ImplementationFinished. VerificationStarted requires a finished implementation.`
      );
    }
  }

  if (input.type === "VerificationObserved") {
    if (!state.verificationStarted) {
      return deny(
        "VERIFICATION_NOT_STARTED",
        `Run ${input.runId} has no VerificationStarted. VerificationObserved requires a prior VerificationStarted.`
      );
    }
  }

  // -------------------------------------------------------------------------
  // 9. Cross-run causation check
  // -------------------------------------------------------------------------
  if (input.causationEventId !== undefined) {
    const causationId = input.causationEventId;
    const causationEvt = allEvents.find((e) => e.eventId === causationId);

    if (causationEvt === undefined) {
      return deny(
        "UNKNOWN_CAUSATION_EVENT",
        `causationEventId "${causationId}" does not exist in the ledger.`
      );
    }

    if (causationEvt.runId !== input.runId) {
      return deny(
        "CROSS_RUN_CAUSATION",
        `causationEventId "${causationId}" belongs to run ${causationEvt.runId}, not ${input.runId}.`
      );
    }
  }

  // -------------------------------------------------------------------------
  // All checks passed
  // -------------------------------------------------------------------------
  return allow();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find a HumanDecisionRecorded event with the given decisionId across all events,
 * excluding events in excludeRunId.
 * Returns the envelope if found in a foreign run, undefined otherwise.
 */
function findDecisionEvent(
  decisionId: string,
  allEvents: readonly EventEnvelope[],
  excludeRunId: string
): EventEnvelope | undefined {
  return allEvents.find(
    (e) =>
      e.type === "HumanDecisionRecorded" &&
      e.runId !== excludeRunId &&
      (e.payload as { decisionId: string }).decisionId === decisionId
  );
}
