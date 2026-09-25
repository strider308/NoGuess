/**
 * Refund domain model.
 *
 * NOTE ON CustomerTier:
 * A Refund may carry the tier of the account it originates from as neutral
 * business context. CustomerTier has NO effect on refund approval thresholds
 * or authorization. Policy decisions are governed solely by PolicyConfig.
 *
 * Models a refund request and its approval lifecycle.
 *
 * Approval rules (enforced via PolicyConfig):
 * - amount <= refundAutoApproveThresholdMinor → may be AUTO_APPROVED
 * - amount >  refundAutoApproveThresholdMinor → must enter PENDING_APPROVAL
 *   and cannot be processed without an explicit approval from a role in
 *   refundApprovalRoles.
 *
 * State machine:
 *   AUTO_APPROVED  ──► PROCESSED
 *   PENDING_APPROVAL ──► APPROVED ──► PROCESSED
 *   PENDING_APPROVAL ──► DENIED
 *   APPROVED         ──► DENIED   (escalation edge; kept for completeness)
 */
import type { Money } from "../lib/money.js";
import type { Result } from "../lib/result.js";
import { err, ok } from "../lib/result.js";
import type { Role } from "./tenant.js";
import type { CustomerTier } from "./account.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RefundStatus =
  | "AUTO_APPROVED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "PROCESSED"
  | "DENIED";

export interface Refund {
  readonly id: string;
  readonly tenantId: string;
  readonly paymentId: string;
  readonly requestedBy: string; // userId
  readonly amount: Money;
  /**
   * The tier of the originating account — neutral business context only.
   * Has NO effect on approval thresholds or authorization decisions.
   */
  readonly accountTier?: CustomerTier;
  status: RefundStatus;
  /** userId of the approver/denier; set when status → APPROVED or DENIED. */
  resolvedBy?: string;
  readonly createdAt: number;
  lastUpdatedAt: number;
}

// ---------------------------------------------------------------------------
// Threshold classification
// ---------------------------------------------------------------------------

/**
 * Determine the initial status for a new refund request.
 * Reads threshold from PolicyConfig values passed in explicitly.
 */
export function classifyRefund(
  amountMinor: number,
  thresholdMinor: number
): RefundStatus {
  return amountMinor <= thresholdMinor ? "AUTO_APPROVED" : "PENDING_APPROVAL";
}

// ---------------------------------------------------------------------------
// Approval state machine
// ---------------------------------------------------------------------------

/**
 * Check whether a refund can be approved.
 * Only PENDING_APPROVAL refunds may be approved.
 */
export function canApproveRefund(refund: Refund): Result<void, string> {
  if (refund.status !== "PENDING_APPROVAL") {
    return err(
      `refund ${refund.id} cannot be approved: status is ${refund.status}`
    );
  }
  return ok(undefined);
}

/**
 * Check whether a refund can be denied.
 * PENDING_APPROVAL and APPROVED refunds may be denied.
 */
export function canDenyRefund(refund: Refund): Result<void, string> {
  if (refund.status !== "PENDING_APPROVAL" && refund.status !== "APPROVED") {
    return err(
      `refund ${refund.id} cannot be denied: status is ${refund.status}`
    );
  }
  return ok(undefined);
}

/**
 * Check whether a refund can be processed (sent to payment processor).
 * Only AUTO_APPROVED or APPROVED refunds may be processed.
 */
export function canProcessRefund(refund: Refund): Result<void, string> {
  if (refund.status !== "AUTO_APPROVED" && refund.status !== "APPROVED") {
    return err(
      `refund ${refund.id} cannot be processed: status is ${refund.status} ` +
        `(must be AUTO_APPROVED or APPROVED)`
    );
  }
  return ok(undefined);
}

/**
 * Return the approval roles required for above-threshold refunds.
 * Exposed as a domain helper so callers don't need to re-implement the logic.
 */
export function refundApprovalRolesRequired(
  approvalRoles: Role[]
): Role[] {
  return approvalRoles;
}
