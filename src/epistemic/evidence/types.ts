/**
 * M3 — Evidence layer types.
 *
 * Re-exports canonical state/authority types from the event vocabulary
 * and defines projection-layer structures.
 */

export type {
  EpistemicState,
  AuthorityClass,
  CanonicalValue,
} from "../events.js";

// ---------------------------------------------------------------------------
// EvidenceEntry — one active or historical evidence item
// ---------------------------------------------------------------------------

import type { EpistemicState, AuthorityClass, CanonicalValue } from "../events.js";

export interface EvidenceEntry {
  readonly evidenceId: string;
  readonly runId: string;
  readonly claimKey: string;
  readonly value: CanonicalValue;
  readonly epistemicState: EpistemicState;
  readonly authorityClass: AuthorityClass;
  readonly sourceRef: string;
  /** Optional metadata. NEVER affects authority selection. */
  readonly confidence: number | undefined;
  /** Whether this evidence has been superseded. Historical records are kept. */
  readonly active: boolean;
  /** The evidenceId that superseded this entry, if any. */
  readonly supersededBy: string | undefined;
}

// ---------------------------------------------------------------------------
// EvidenceProjection — the replayed state for a single run
// ---------------------------------------------------------------------------

export interface EvidenceProjection {
  readonly runId: string;
  /** All evidence items keyed by evidenceId (active + superseded). */
  readonly byId: ReadonlyMap<string, EvidenceEntry>;
  /** Active evidence items grouped by claimKey. */
  readonly byClaimKey: ReadonlyMap<string, readonly EvidenceEntry[]>;
  /** Set of evidenceIds that have been superseded. */
  readonly supersededIds: ReadonlySet<string>;
  /** Active evidence only (convenience view). */
  readonly activeItems: readonly EvidenceEntry[];
  /** Recorded conflict groups: array of evidenceId arrays. */
  readonly conflicts: readonly (readonly string[])[];
}
