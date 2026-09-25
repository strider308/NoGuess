/**
 * M6 — CapabilityService: capability gate.
 *
 * Design invariants:
 *   - BOB may REQUEST a capability.
 *   - KERNEL may GRANT or DENY.
 *   - BOB must not self-grant.
 *   - A request is DENIED when the run has unresolved MATERIAL Guess Debt.
 *   - Grant basis must include relevant HumanDecisionRecorded event IDs.
 *   - isCapabilityCurrentlyValid() returns false if basis decisions are superseded.
 *   - All appends traverse KernelGuardedLedger.
 */

import type { AppendInput, EventEnvelope } from "../event-envelope.js";
import type {
  CapabilityRequestedPayload,
  CapabilityGrantedPayload,
  CapabilityDeniedPayload,
  CapabilityEnvelope,
  HumanDecisionRecordedPayload,
  DecisionSupersededPayload,
} from "../events.js";
import type { KernelGuardedLedger } from "../kernel/guarded-ledger.js";
import { deriveGuessDebt } from "../intent/intent-service.js";

// ---------------------------------------------------------------------------
// CapabilityRequestInput — what BOB supplies when requesting capability
// ---------------------------------------------------------------------------

export interface CapabilityRequestInput {
  capabilityId: string;
  runId: string;
  readPaths?: string[];
  writePaths?: string[];
  commands?: string[];
  network?: boolean;
  mcpTools?: string[];
}

// ---------------------------------------------------------------------------
// CapabilityDecision — result returned to caller
// ---------------------------------------------------------------------------

export type CapabilityDecision =
  | { readonly granted: true; readonly envelope: CapabilityEnvelope; readonly grantEventId: string }
  | { readonly granted: false; readonly reason: string; readonly denialCode: string; readonly denyEventId: string };

// ---------------------------------------------------------------------------
// CapabilityService
// ---------------------------------------------------------------------------

export class CapabilityService {
  private readonly guarded: KernelGuardedLedger;

  constructor(guarded: KernelGuardedLedger) {
    this.guarded = guarded;
  }

  // -------------------------------------------------------------------------
  // requestCapability — BOB requests; KERNEL evaluates and records grant/deny.
  //
  // BOB emits the CapabilityRequested event.
  // KERNEL evaluates Guess Debt and emits CapabilityGranted or CapabilityDenied.
  // -------------------------------------------------------------------------

  requestCapability(input: CapabilityRequestInput): CapabilityDecision {
    const { runId, capabilityId } = input;

    // BOB records the request
    const reqPayload: CapabilityRequestedPayload = {
      capabilityId,
      capabilityType: "IMPLEMENTATION",
      runId,
      readPaths: input.readPaths ?? [],
      writePaths: input.writePaths ?? [],
      commands: input.commands ?? [],
      network: input.network ?? false,
      mcpTools: input.mcpTools ?? [],
    };
    const reqInput: AppendInput<"CapabilityRequested"> = {
      runId,
      type: "CapabilityRequested",
      emitter: "BOB",
      payload: reqPayload,
    };
    const reqEvt = this.guarded.append(reqInput);

    // KERNEL evaluates: derive current Guess Debt
    const events = this.guarded.listRun(runId);
    const debt = deriveGuessDebt(runId, events);
    const unresolvedDebt = debt.filter((d) => d.status === "UNRESOLVED");

    if (unresolvedDebt.length > 0) {
      // KERNEL denies
      const denyPayload: CapabilityDeniedPayload = {
        capabilityId,
        reason: `Capability denied: ${unresolvedDebt.length} unresolved material Guess Debt item(s). ` +
          `Unresolved claims: ${unresolvedDebt.map((d) => d.claimKey).join(", ")}.`,
        denialCode: "UNRESOLVED_MATERIAL_GUESS_DEBT",
      };
      const denyInput: AppendInput<"CapabilityDenied"> = {
        runId,
        type: "CapabilityDenied",
        emitter: "KERNEL",
        causationEventId: reqEvt.eventId,
        payload: denyPayload,
      };
      const denyEvt = this.guarded.append(denyInput);

      return {
        granted: false,
        reason: denyPayload.reason,
        denialCode: "UNRESOLVED_MATERIAL_GUESS_DEBT",
        denyEventId: denyEvt.eventId,
      };
    }

    // Collect the human decision event IDs that resolved material debt
    const basisEventIds = collectHumanDecisionBasis(runId, events);

    const envelope: CapabilityEnvelope = {
      capabilityId,
      runId,
      readPaths: input.readPaths ?? [],
      writePaths: input.writePaths ?? [],
      commands: input.commands ?? [],
      network: input.network ?? false,
      mcpTools: input.mcpTools ?? [],
      basisEventIds,
    };

    const grantPayload: CapabilityGrantedPayload = {
      capabilityId,
      envelope,
      basisEventIds,
    };
    const grantInput: AppendInput<"CapabilityGranted"> = {
      runId,
      type: "CapabilityGranted",
      emitter: "KERNEL",
      causationEventId: reqEvt.eventId,
      payload: grantPayload,
    };
    const grantEvt = this.guarded.append(grantInput);

    return { granted: true, envelope, grantEventId: grantEvt.eventId };
  }

  // -------------------------------------------------------------------------
  // isCapabilityCurrentlyValid — returns false if any basis decision has been
  // superseded (DecisionSuperseded recorded for one of the basis events).
  // -------------------------------------------------------------------------

  isCapabilityCurrentlyValid(runId: string, capabilityId: string): boolean {
    const events = this.guarded.listRun(runId);

    // Find the CapabilityGranted event for this capabilityId
    const grantEvt = events.find(
      (e) =>
        e.type === "CapabilityGranted" &&
        (e.payload as CapabilityGrantedPayload).capabilityId === capabilityId
    );
    if (grantEvt === undefined) return false;

    const grantPayload = grantEvt.payload as CapabilityGrantedPayload;
    const basisEventIds = new Set(grantPayload.basisEventIds);

    // Collect superseded decisionIds
    const supersededDecisionIds = new Set<string>();
    for (const evt of events) {
      if (evt.type === "DecisionSuperseded") {
        const p = evt.payload as DecisionSupersededPayload;
        supersededDecisionIds.add(p.decisionId);
      }
    }

    // Cross-reference: find decisionIds referenced in basis event IDs
    for (const evt of events) {
      if (evt.type === "HumanDecisionRecorded" && basisEventIds.has(evt.eventId)) {
        const p = evt.payload as HumanDecisionRecordedPayload;
        if (supersededDecisionIds.has(p.decisionId)) {
          return false;
        }
      }
    }

    return true;
  }
}

// ---------------------------------------------------------------------------
// collectHumanDecisionBasis — find eventIds of HumanDecisionRecorded events
// that provided resolutions for material claims in this run.
// ---------------------------------------------------------------------------

function collectHumanDecisionBasis(
  runId: string,
  events: readonly EventEnvelope[]
): string[] {
  const basisIds: string[] = [];
  for (const evt of events) {
    if (evt.runId === runId && evt.type === "HumanDecisionRecorded") {
      const p = evt.payload as HumanDecisionRecordedPayload;
      // Include any human decision that projected a claim (claimKey present)
      if (p.claimKey !== undefined) {
        basisIds.push(evt.eventId);
      }
    }
  }
  return basisIds;
}
