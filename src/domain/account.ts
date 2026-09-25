/**
 * Account domain model.
 *
 * Models the account lifecycle within a tenant.
 * An account is a billable/operational entity distinct from a User.
 *
 * Lifecycle state machine:
 *
 *   ACTIVE ──► SUSPENDED ──► ACTIVE   (reactivation allowed)
 *   ACTIVE ──► DEACTIVATED
 *   DEACTIVATED ──► PURGED            (only if purge-eligible by retention)
 *
 * Skipping states and reversing from PURGED are not permitted.
 */
import type { Result } from "../lib/result.js";
import { err, ok } from "../lib/result.js";

// ---------------------------------------------------------------------------
// Customer tier
// ---------------------------------------------------------------------------

/**
 * CustomerTier — ordinary business classification of an account/customer.
 *
 * This is neutral business data only.
 * It has NO effect on refund authorization, approval thresholds, or any
 * other policy decision. Refund policy is governed solely by PolicyConfig.
 */
export type CustomerTier = "STANDARD" | "VIP";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccountStatus =
  | "ACTIVE"
  | "SUSPENDED"
  | "DEACTIVATED"
  | "PURGED";

export interface Account {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  /**
   * Customer tier for this account.
   * STANDARD or VIP — neutral business data.
   * Has no effect on refund thresholds or approval policy.
   */
  readonly tier: CustomerTier;
  status: AccountStatus;
  readonly createdAt: number; // Unix ms
  deactivatedAt?: number;     // Unix ms; set when status → DEACTIVATED
  purgedAt?: number;          // Unix ms; set when status → PURGED
}

// ---------------------------------------------------------------------------
// Valid transition table
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<AccountStatus, AccountStatus[]> = {
  ACTIVE: ["SUSPENDED", "DEACTIVATED"],
  SUSPENDED: ["ACTIVE"],
  DEACTIVATED: ["PURGED"],
  PURGED: [],
};

// ---------------------------------------------------------------------------
// Transition guard
// ---------------------------------------------------------------------------

/**
 * Validate that transitioning from `from` to `to` is permitted.
 * Does NOT check authorization or retention — those are service concerns.
 */
export function validateTransition(
  from: AccountStatus,
  to: AccountStatus
): Result<void, string> {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    return err(
      `invalid account transition: ${from} → ${to}. ` +
        `Allowed from ${from}: [${allowed.join(", ") || "none"}]`
    );
  }
  return ok(undefined);
}

/**
 * Return true if an account can receive a purge operation.
 * The account must be DEACTIVATED; retention eligibility is checked separately
 * by the service using RetentionPolicy.
 */
export function isPurgeCandidate(account: Account): boolean {
  return account.status === "DEACTIVATED";
}
