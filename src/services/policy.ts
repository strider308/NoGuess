/**
 * PolicyConfig — explicit, injectable business policy values.
 *
 * All benchmark-relevant thresholds and limits live here.
 * Services receive this via constructor injection; no value is buried
 * inside domain logic as a hardcoded constant.
 *
 * Currency amounts are integer minor units (e.g. paise for INR).
 */
import type { Role } from "../domain/tenant.js";

export interface PolicyConfig {
  /** Minor-unit threshold below which refunds may be auto-approved. */
  refundAutoApproveThresholdMinor: number;
  /** ISO 4217 currency code for refund amounts (e.g. "INR"). */
  refundCurrency: string;
  /** Roles authorized to approve above-threshold refunds. */
  refundApprovalRoles: Role[];
  /** Maximum total charge attempts (including the first). */
  paymentMaxAttempts: number;
  /**
   * Per-retry back-off durations in seconds.
   * Index 0 = wait before attempt 2, index 1 = wait before attempt 3, etc.
   */
  paymentBackoffSeconds: number[];
  /** Session TTL in seconds from issuance. */
  sessionTtlSeconds: number;
  /** Minimum data-retention period in days before purge is eligible. */
  retentionTtlDays: number;
  /** Maximum total delivery attempts for a webhook delivery. */
  webhookMaxRetries: number;
}

/**
 * Default PolicyConfig used by the deterministic seed and integration tests.
 *
 * currency = INR
 * refundAutoApproveThresholdMinor = 1_000_000 (= ₹10,000.00 in paise)
 */
export const DEFAULT_POLICY: PolicyConfig = {
  refundAutoApproveThresholdMinor: 1_000_000,
  refundCurrency: "INR",
  refundApprovalRoles: ["ADMIN", "MANAGER"],
  paymentMaxAttempts: 3,
  paymentBackoffSeconds: [60, 300],
  sessionTtlSeconds: 3_600,
  retentionTtlDays: 90,
  webhookMaxRetries: 3,
};
