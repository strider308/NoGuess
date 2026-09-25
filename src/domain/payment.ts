/**
 * Payment domain model.
 *
 * Models a payment charge attempt and its retry lifecycle.
 *
 * Failure kinds:
 * - TRANSIENT: a temporary failure (network, timeout, processor backlog).
 *              Retry is allowed after the configured back-off.
 * - HARD_DECLINE: a permanent rejection (insufficient funds, blocked card, fraud).
 *                 Retry must never be offered regardless of elapsed time.
 *
 * Retry eligibility requires ALL of:
 * 1. status === FAILED
 * 2. failureKind === TRANSIENT
 * 3. attempts < maxAttempts  (from PolicyConfig)
 * 4. nowMs >= nextRetryAt    (back-off has elapsed per FakeClock)
 */
import type { Money } from "../lib/money.js";
import type { Result } from "../lib/result.js";
import { err, ok } from "../lib/result.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED";

export type FailureKind = "TRANSIENT" | "HARD_DECLINE";

export interface Payment {
  readonly id: string;
  readonly tenantId: string;
  readonly accountId: string;
  /** Caller-supplied idempotency key. Re-submitting the same key returns the
   *  existing record without creating a new charge. */
  readonly idempotencyKey: string;
  readonly amount: Money;
  status: PaymentStatus;
  /** Set only when status === FAILED. Deleted when payment transitions away from FAILED. */
  failureKind?: FailureKind;
  /** Number of charge attempts made so far (1 after the first attempt). */
  attempts: number;
  /** Unix ms when the next retry is allowed. Deleted on retry. */
  nextRetryAt?: number;
  readonly createdAt: number;
  lastUpdatedAt: number;
}

// ---------------------------------------------------------------------------
// Retry eligibility
// ---------------------------------------------------------------------------

/**
 * Determine whether a payment is eligible for a retry attempt.
 *
 * @param payment     The payment record.
 * @param nowMs       Current clock time from FakeClock.
 * @param maxAttempts Maximum total attempts allowed (from PolicyConfig).
 */
export function isRetryEligible(
  payment: Payment,
  nowMs: number,
  maxAttempts: number
): Result<void, string> {
  if (payment.status !== "FAILED") {
    return err(`payment ${payment.id} is not in FAILED status (got ${payment.status})`);
  }
  if (payment.failureKind === "HARD_DECLINE") {
    return err(
      `payment ${payment.id} was hard-declined and is never retryable`
    );
  }
  if (payment.failureKind !== "TRANSIENT") {
    return err(
      `payment ${payment.id} has no failure kind set; cannot determine retry eligibility`
    );
  }
  if (payment.attempts >= maxAttempts) {
    return err(
      `payment ${payment.id} has reached the maximum attempt limit ` +
        `(${payment.attempts}/${maxAttempts})`
    );
  }
  if (payment.nextRetryAt !== undefined && nowMs < payment.nextRetryAt) {
    return err(
      `payment ${payment.id} back-off has not elapsed ` +
        `(next retry at ${payment.nextRetryAt}, now ${nowMs})`
    );
  }
  return ok(undefined);
}
