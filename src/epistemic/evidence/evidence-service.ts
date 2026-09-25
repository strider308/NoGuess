/**
 * M3 — EvidenceService: deterministic operations over evidence.
 *
 * Provides:
 *   - Admission checks for EvidenceSuperseded (supersession rules)
 *   - Admission checks for EvidenceConflictDetected (emitter boundary)
 *   - recordConflict(): emit EvidenceConflictDetected through KernelGuardedLedger
 *   - projection(): derive current EvidenceProjection for a run
 *
 * IMPORTANT: EvidenceService depends on KernelGuardedLedger for ALL appends.
 * No raw LedgerPort append path exists here. Every event append goes through
 * the kernel admission gate.
 */

import type { AppendInput, Emitter } from "../event-envelope.js";
import type {
  EvidenceObservedPayload,
  EvidenceSupersededPayload,
  EvidenceConflictDetectedPayload,
} from "../events.js";
import type { KernelGuardedLedger } from "../kernel/guarded-ledger.js";
import { deriveEvidenceState } from "./projection.js";
import type { EvidenceProjection } from "./types.js";

// ---------------------------------------------------------------------------
// Admission error
// ---------------------------------------------------------------------------

export class EvidenceAdmissionError extends Error {
  readonly code: EvidenceAdmissionCode;

  constructor(code: EvidenceAdmissionCode, message: string) {
    super(message);
    this.name = "EvidenceAdmissionError";
    this.code = code;
  }
}

export type EvidenceAdmissionCode =
  | "BOB_AUTHORITY_FORBIDDEN"
  | "INVALID_CONFIDENCE"
  | "UNKNOWN_EVIDENCE_REFERENCE"
  | "CROSS_RUN_SUPERSESSION"
  | "ALREADY_SUPERSEDED"
  | "CONFLICT_EMITTER_NOT_KERNEL"
  | "DUPLICATE_CONFLICT";

// ---------------------------------------------------------------------------
// checkEvidenceObservedAdmission — service-layer attestation check
// (mirrors the kernel rules for pre-validate use in tests/service layer)
// ---------------------------------------------------------------------------

/**
 * Check whether an EvidenceObserved proposal is admissible at the service layer.
 * Primary enforcement is in the kernel rules; this is for pre-kernel validation.
 */
export function checkEvidenceObservedAdmission(
  emitter: Emitter,
  payload: EvidenceObservedPayload
): void {
  // Confidence must be finite if provided
  if (payload.confidence !== undefined) {
    if (
      typeof payload.confidence !== "number" ||
      !Number.isFinite(payload.confidence) ||
      payload.confidence < 0 ||
      payload.confidence > 1
    ) {
      throw new EvidenceAdmissionError(
        "INVALID_CONFIDENCE",
        `confidence must be a finite number in [0,1], got ${payload.confidence}.`
      );
    }
  }

  if (emitter === "BOB") {
    if (payload.authorityClass !== "MODEL_INFERENCE") {
      throw new EvidenceAdmissionError(
        "BOB_AUTHORITY_FORBIDDEN",
        `BOB may not directly attest authorityClass "${payload.authorityClass}". ` +
          `BOB-emitted evidence must use authorityClass "MODEL_INFERENCE".`
      );
    }
    if (payload.epistemicState !== "INFERRED") {
      throw new EvidenceAdmissionError(
        "BOB_AUTHORITY_FORBIDDEN",
        `BOB may not claim epistemicState "${payload.epistemicState}". ` +
          `BOB-emitted evidence must use epistemicState "INFERRED".`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// checkEvidenceSupersededAdmission — supersession rule check
// ---------------------------------------------------------------------------

/**
 * Check whether an EvidenceSuperseded proposal is admissible.
 *
 * Rules:
 *   - referenced evidenceId must exist in this run
 *   - referenced evidenceId must not be from another run
 *   - already-superseded evidence cannot be superseded again
 */
export function checkEvidenceSupersededAdmission(
  runId: string,
  payload: EvidenceSupersededPayload,
  projection: EvidenceProjection,
  allProjections: ReadonlyMap<string, EvidenceProjection>
): void {
  const { evidenceId } = payload;

  // Check within the current run's projection
  const existingEntry = projection.byId.get(evidenceId);

  if (existingEntry !== undefined) {
    // Found in the run — check if already superseded
    if (!existingEntry.active) {
      throw new EvidenceAdmissionError(
        "ALREADY_SUPERSEDED",
        `Evidence "${evidenceId}" in run "${runId}" has already been superseded.`
      );
    }
    return; // Admissible
  }

  // Not found in the run's evidence — check other runs (cross-run check)
  for (const [otherRunId, otherProjection] of allProjections) {
    if (otherRunId === runId) continue;
    if (otherProjection.byId.has(evidenceId)) {
      throw new EvidenceAdmissionError(
        "CROSS_RUN_SUPERSESSION",
        `Evidence "${evidenceId}" belongs to run "${otherRunId}", ` +
          `not run "${runId}". Cross-run supersession is not allowed.`
      );
    }
  }

  throw new EvidenceAdmissionError(
    "UNKNOWN_EVIDENCE_REFERENCE",
    `Evidence "${evidenceId}" does not exist in run "${runId}".`
  );
}

// ---------------------------------------------------------------------------
// checkConflictAdmission — EvidenceConflictDetected emitter check
// ---------------------------------------------------------------------------

/**
 * Check whether an EvidenceConflictDetected proposal is admissible.
 *
 * Rules:
 *   - Only KERNEL may emit EvidenceConflictDetected
 *   - Must not duplicate an identical active conflict set
 */
export function checkConflictAdmission(
  emitter: Emitter,
  payload: EvidenceConflictDetectedPayload,
  projection: EvidenceProjection
): void {
  if (emitter !== "KERNEL") {
    throw new EvidenceAdmissionError(
      "CONFLICT_EMITTER_NOT_KERNEL",
      `EvidenceConflictDetected must be emitted by KERNEL, got "${emitter}".`
    );
  }

  // Check for duplicate conflict set
  const incomingKey = [...payload.evidenceIds].sort().join("|");
  for (const recorded of projection.conflicts) {
    const key = [...recorded].sort().join("|");
    if (key === incomingKey) {
      throw new EvidenceAdmissionError(
        "DUPLICATE_CONFLICT",
        `EvidenceConflictDetected for the identical active evidence set ` +
          `[${payload.evidenceIds.join(", ")}] has already been recorded.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// EvidenceService
// ---------------------------------------------------------------------------

export class EvidenceService {
  /**
   * EvidenceService requires KernelGuardedLedger — NOT raw LedgerPort.
   * All appends go through the kernel admission gate.
   */
  private readonly guarded: KernelGuardedLedger;

  constructor(guarded: KernelGuardedLedger) {
    this.guarded = guarded;
  }

  // -------------------------------------------------------------------------
  // projection() — derive current evidence state for a run
  // -------------------------------------------------------------------------

  projection(runId: string): EvidenceProjection {
    const events = this.guarded.listRun(runId);
    return deriveEvidenceState(runId, events);
  }

  // -------------------------------------------------------------------------
  // allProjections() — derive evidence projections for all runs
  // -------------------------------------------------------------------------

  private allProjections(): Map<string, EvidenceProjection> {
    const all = this.guarded.listAll();
    const runIds = new Set(all.map((e) => e.runId));
    const result = new Map<string, EvidenceProjection>();
    for (const runId of runIds) {
      const runEvents = all.filter((e) => e.runId === runId);
      result.set(runId, deriveEvidenceState(runId, runEvents));
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // validateEvidenceObserved — check attestation boundary before append
  // -------------------------------------------------------------------------

  validateEvidenceObserved(input: AppendInput<"EvidenceObserved">): void {
    checkEvidenceObservedAdmission(input.emitter, input.payload);
  }

  // -------------------------------------------------------------------------
  // validateEvidenceSuperseded — check supersession rules before append
  // -------------------------------------------------------------------------

  validateEvidenceSuperseded(
    runId: string,
    input: AppendInput<"EvidenceSuperseded">
  ): void {
    const projection = this.projection(runId);
    const allProjections = this.allProjections();
    checkEvidenceSupersededAdmission(runId, input.payload, projection, allProjections);
  }

  // -------------------------------------------------------------------------
  // recordConflict — emit EvidenceConflictDetected via KernelGuardedLedger
  //
  // Performs duplicate-set admission check before appending.
  // The append itself traverses KernelGuardedLedger → EpistemicKernel → ledger.
  // -------------------------------------------------------------------------

  recordConflict(
    runId: string,
    payload: EvidenceConflictDetectedPayload
  ): void {
    const projection = this.projection(runId);
    checkConflictAdmission("KERNEL", payload, projection);
    const conflictInput: AppendInput<"EvidenceConflictDetected"> = {
      runId,
      type: "EvidenceConflictDetected",
      emitter: "KERNEL",
      payload,
    };
    // Must go through KernelGuardedLedger — the kernel enforces emitter = KERNEL
    this.guarded.append(conflictInput);
  }
}
