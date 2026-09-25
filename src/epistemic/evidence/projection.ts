/**
 * M3 — Evidence projection: pure replay of ledger events into EvidenceProjection.
 *
 * deriveEvidenceState() replays EvidenceObserved, EvidenceSuperseded,
 * EvidenceConflictDetected, and HumanDecisionRecorded events for one run
 * and produces a deterministic EvidenceProjection.
 *
 * No mutable state is maintained outside of replay.
 * Replaying the same event sequence always produces the same result.
 */

import type { EventEnvelope } from "../event-envelope.js";
import type {
  EvidenceObservedPayload,
  EvidenceSupersededPayload,
  EvidenceConflictDetectedPayload,
  HumanDecisionRecordedPayload,
} from "../events.js";
import type { EvidenceEntry, EvidenceProjection } from "./types.js";

// ---------------------------------------------------------------------------
// deriveEvidenceState — pure replay function
// ---------------------------------------------------------------------------

/**
 * Derive the EvidenceProjection for a single run from its ordered events.
 *
 * @param runId  The run being projected.
 * @param events All events for this run, ordered by sequence ascending.
 *               Events from other runs must NOT be included.
 */
export function deriveEvidenceState(
  runId: string,
  events: readonly EventEnvelope[]
): EvidenceProjection {
  // Mutable working state
  const byId = new Map<string, EvidenceEntry>();
  const supersededIds = new Set<string>();
  const conflicts: string[][] = [];
  // Track which conflict sets have already been recorded (by sorted evidence ID key)
  const conflictKeys = new Set<string>();

  for (const evt of events) {
    // Only process events belonging to this run (guard against misuse)
    if (evt.runId !== runId) continue;

    switch (evt.type) {
      case "EvidenceObserved": {
        const p = evt.payload as EvidenceObservedPayload;
        const entry: EvidenceEntry = {
          evidenceId: p.evidenceId,
          runId,
          claimKey: p.claimKey,
          value: p.value,
          epistemicState: p.epistemicState,
          authorityClass: p.authorityClass,
          sourceRef: p.sourceRef,
          confidence:
            p.confidence !== undefined ? p.confidence : undefined,
          active: true,
          supersededBy: undefined,
        };
        byId.set(p.evidenceId, entry);
        break;
      }

      case "EvidenceSuperseded": {
        const p = evt.payload as EvidenceSupersededPayload;
        const existing = byId.get(p.evidenceId);
        if (existing !== undefined) {
          // Mark as inactive — do not delete (preserve history)
          byId.set(p.evidenceId, {
            ...existing,
            active: false,
            supersededBy: p.supersededBy,
          });
          supersededIds.add(p.evidenceId);
        }
        break;
      }

      case "EvidenceConflictDetected": {
        const p = evt.payload as EvidenceConflictDetectedPayload;
        const key = [...p.evidenceIds].sort().join("|");
        if (!conflictKeys.has(key)) {
          conflictKeys.add(key);
          conflicts.push([...p.evidenceIds]);
        }
        break;
      }

      case "HumanDecisionRecorded": {
        const p = evt.payload as HumanDecisionRecordedPayload;
        // Project as HUMAN_RESOLVED evidence if claimKey and value are present
        if (p.claimKey !== undefined && p.value !== undefined) {
          // Synthetic evidenceId derived from decisionId — deterministic
          const syntheticId = `human-decision:${p.decisionId}`;
          const entry: EvidenceEntry = {
            evidenceId: syntheticId,
            runId,
            claimKey: p.claimKey,
            value: p.value,
            epistemicState: "HUMAN_RESOLVED",
            authorityClass: "HUMAN_RESOLVED",
            sourceRef: `HumanDecisionRecorded:${p.decisionId}`,
            confidence: undefined,
            active: true,
            supersededBy: undefined,
          };
          byId.set(syntheticId, entry);
        }
        break;
      }

      default:
        break;
    }
  }

  // Build byClaimKey from current active entries
  const byClaimKey = new Map<string, EvidenceEntry[]>();
  for (const entry of byId.values()) {
    if (!entry.active) continue;
    const list = byClaimKey.get(entry.claimKey);
    if (list !== undefined) {
      list.push(entry);
    } else {
      byClaimKey.set(entry.claimKey, [entry]);
    }
  }

  const activeItems = [...byId.values()].filter((e) => e.active);

  return {
    runId,
    byId,
    byClaimKey,
    supersededIds,
    activeItems,
    conflicts,
  };
}
