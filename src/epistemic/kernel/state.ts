/**
 * M2 — Replay-derived kernel state.
 *
 * KernelRunState is derived ONLY from ledger events.
 * No mutable state is manufactured outside of replay.
 * Replaying the same event sequence always produces the same state.
 */

import type { EventEnvelope } from "../event-envelope.js";

// ---------------------------------------------------------------------------
// KernelRunState — what we know about one run from its events
// ---------------------------------------------------------------------------

export interface KernelRunState {
  /** The run identifier. */
  readonly runId: string;
  /** Whether RequestReceived has been recorded for this run. */
  readonly requestReceived: boolean;
  /** Whether RunClosed has been recorded (terminal state). */
  readonly closed: boolean;
  /** Sequence number of the latest event in this run. */
  readonly latestSequence: number;
  /** Set of decisionIds from HumanDecisionRecorded events still in effect. */
  readonly activeDecisionIds: ReadonlySet<string>;
  /** Set of decisionIds that have been superseded via DecisionSuperseded. */
  readonly supersededDecisionIds: ReadonlySet<string>;
  /** Set of eventIds for outstanding ClarificationRequested events. */
  readonly clarificationEventIds: ReadonlySet<string>;
  /** Set of eventIds for CapabilityGranted events. */
  readonly capabilityGrantedEventIds: ReadonlySet<string>;
  /** Set of eventIds for CapabilityDenied events. */
  readonly capabilityDeniedEventIds: ReadonlySet<string>;
  /** Set of eventIds for CapabilityExpired events. */
  readonly capabilityExpiredEventIds: ReadonlySet<string>;
  /** Whether ImplementationStarted has been recorded with no matching Finished. */
  readonly implementationActive: boolean;
  /** Whether ImplementationFinished has been recorded for this run. */
  readonly implementationFinished: boolean;
  /** Whether VerificationStarted has been recorded for this run. */
  readonly verificationStarted: boolean;
  /** Whether AcceptanceComputed has been recorded for this run. */
  readonly acceptanceComputed: boolean;
}

// ---------------------------------------------------------------------------
// deriveKernelState — pure replay function
// ---------------------------------------------------------------------------

/**
 * Derive the KernelRunState for a single run from its ordered event list.
 *
 * @param runId  The run identifier being derived.
 * @param events All events for this run, ordered by sequence ascending.
 *               Events from other runs must NOT be included.
 */
export function deriveKernelState(
  runId: string,
  events: readonly EventEnvelope[]
): KernelRunState {
  let requestReceived = false;
  let closed = false;
  let latestSequence = 0;
  const activeDecisionIds = new Set<string>();
  const supersededDecisionIds = new Set<string>();
  const clarificationEventIds = new Set<string>();
  const capabilityGrantedEventIds = new Set<string>();
  const capabilityDeniedEventIds = new Set<string>();
  const capabilityExpiredEventIds = new Set<string>();
  let implementationActive = false;
  let implementationFinished = false;
  let verificationStarted = false;
  let acceptanceComputed = false;

  for (const evt of events) {
    latestSequence = evt.sequence;

    switch (evt.type) {
      case "RequestReceived":
        requestReceived = true;
        break;

      case "HumanDecisionRecorded": {
        const p = evt.payload as { decisionId: string };
        activeDecisionIds.add(p.decisionId);
        break;
      }

      case "DecisionSuperseded": {
        const p = evt.payload as { decisionId: string };
        activeDecisionIds.delete(p.decisionId);
        supersededDecisionIds.add(p.decisionId);
        break;
      }

      case "ClarificationRequested":
        clarificationEventIds.add(evt.eventId);
        break;

      case "CapabilityGranted":
        capabilityGrantedEventIds.add(evt.eventId);
        break;

      case "CapabilityDenied":
        capabilityDeniedEventIds.add(evt.eventId);
        break;

      case "CapabilityExpired":
        capabilityExpiredEventIds.add(evt.eventId);
        break;

      case "ImplementationStarted":
        implementationActive = true;
        break;

      case "ImplementationFinished":
        implementationActive = false;
        implementationFinished = true;
        break;

      case "VerificationStarted":
        verificationStarted = true;
        break;

      case "AcceptanceComputed":
        acceptanceComputed = true;
        break;

      case "RunClosed":
        closed = true;
        break;

      default:
        // Other event types do not affect M2 kernel state.
        break;
    }
  }

  return {
    runId,
    requestReceived,
    closed,
    latestSequence,
    activeDecisionIds,
    supersededDecisionIds,
    clarificationEventIds,
    capabilityGrantedEventIds,
    capabilityDeniedEventIds,
    capabilityExpiredEventIds,
    implementationActive,
    implementationFinished,
    verificationStarted,
    acceptanceComputed,
  };
}
