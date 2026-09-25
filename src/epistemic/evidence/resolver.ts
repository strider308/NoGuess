/**
 * M3 — Evidence resolver: scope-sensitive authority-based claim resolution.
 *
 * resolveClaim() returns a discriminated union:
 *   RESOLVED         — one canonical value determined deterministically
 *   CONFLICTING      — equal-authority evidence asserts different values
 *   EXTERNAL_DECISION — incomparable maximal authorities with different values
 *   UNKNOWN          — no active evidence for the claim
 *
 * Resolution rules (applied in order):
 *   1. No active evidence → UNKNOWN
 *   2. Apply authority policy to find maximal (non-dominated) authority classes
 *   3. Same maximal authority + same canonical value → RESOLVED
 *   4. Same maximal authority + different values → CONFLICTING
 *   5. Incomparable maximal authorities + different values → EXTERNAL_DECISION
 *   6. MODEL_INFERENCE only → RESOLVED with epistemicState INFERRED
 *
 * Confidence NEVER affects authority selection.
 */

import { canonicalJson } from "../canonical-json.js";
import type { AuthorityClass, EpistemicState, CanonicalValue } from "../events.js";
import type { EvidenceEntry, EvidenceProjection } from "./types.js";
import { PolicyEvaluator } from "./authority-policy.js";
import type { AuthorityPolicy } from "./authority-policy.js";

// ---------------------------------------------------------------------------
// EvidenceResolution — discriminated union
// ---------------------------------------------------------------------------

export type EvidenceResolution =
  | {
      readonly kind: "RESOLVED";
      readonly claimKey: string;
      readonly value: CanonicalValue;
      readonly epistemicState: EpistemicState;
      readonly authorityClass: AuthorityClass;
      readonly supportingEvidenceIds: readonly string[];
    }
  | {
      readonly kind: "CONFLICTING";
      readonly claimKey: string;
      readonly epistemicState: "CONFLICTING";
      readonly conflictingEvidenceIds: readonly string[];
    }
  | {
      readonly kind: "EXTERNAL_DECISION";
      readonly claimKey: string;
      readonly epistemicState: "EXTERNAL_DECISION";
      readonly conflictingEvidenceIds: readonly string[];
    }
  | {
      readonly kind: "UNKNOWN";
      readonly claimKey: string;
      readonly epistemicState: "UNKNOWN";
    };

// ---------------------------------------------------------------------------
// resolveClaim — the core resolution function
// ---------------------------------------------------------------------------

/**
 * Resolve a claim using active (non-superseded) evidence and the supplied
 * authority policy.
 *
 * @param projection  Evidence projection for the run (derived by replay).
 * @param claimKey    The claim to resolve.
 * @param policy      Scope-sensitive authority policy.
 */
export function resolveClaim(
  projection: EvidenceProjection,
  claimKey: string,
  policy: AuthorityPolicy
): EvidenceResolution {
  const evaluator = new PolicyEvaluator(policy);

  // Rule 1: no active evidence
  const active = projection.byClaimKey.get(claimKey);
  if (active === undefined || active.length === 0) {
    return { kind: "UNKNOWN", claimKey, epistemicState: "UNKNOWN" };
  }

  // Collect unique active authority classes present
  const classesPresent = [...new Set(active.map((e) => e.authorityClass))];

  // Find maximal (non-dominated) authority classes
  const maximalClasses = evaluator.maximal(classesPresent);

  // Filter active evidence down to items with a maximal authority class
  const maximalEvidence = active.filter((e) =>
    maximalClasses.includes(e.authorityClass)
  );

  // Group by canonical value
  const byValue = new Map<string, EvidenceEntry[]>();
  for (const entry of maximalEvidence) {
    const key = canonicalJson(entry.value);
    const list = byValue.get(key);
    if (list !== undefined) {
      list.push(entry);
    } else {
      byValue.set(key, [entry]);
    }
  }

  const distinctValues = [...byValue.values()];

  // Rule 3: single canonical value across all maximal evidence
  if (distinctValues.length === 1) {
    const winners = distinctValues[0]!;
    const firstEntry = winners[0]!;

    // Rule 6: MODEL_INFERENCE only stays INFERRED
    const epistemicState: EpistemicState =
      firstEntry.authorityClass === "MODEL_INFERENCE"
        ? "INFERRED"
        : firstEntry.epistemicState;

    return {
      kind: "RESOLVED",
      claimKey,
      value: firstEntry.value,
      epistemicState,
      authorityClass: firstEntry.authorityClass,
      supportingEvidenceIds: winners.map((e) => e.evidenceId),
    };
  }

  // Multiple distinct values from maximal evidence — determine conflict type
  // Check if all maximal evidence shares the same authority class
  const maximalClassSet = new Set(maximalEvidence.map((e) => e.authorityClass));

  if (maximalClassSet.size === 1) {
    // Rule 4: same authority class, different values → CONFLICTING
    return {
      kind: "CONFLICTING",
      claimKey,
      epistemicState: "CONFLICTING",
      conflictingEvidenceIds: maximalEvidence.map((e) => e.evidenceId),
    };
  }

  // Rule 5: incomparable maximal authorities with different values → EXTERNAL_DECISION
  return {
    kind: "EXTERNAL_DECISION",
    claimKey,
    epistemicState: "EXTERNAL_DECISION",
    conflictingEvidenceIds: maximalEvidence.map((e) => e.evidenceId),
  };
}
