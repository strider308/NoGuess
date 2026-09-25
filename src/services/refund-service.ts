/**
 * RefundService — request, approve, deny, and process refunds.
 *
 * Invariants enforced:
 * - Tenant isolation: actor must own the payment being refunded.
 * - Threshold: refunds <= threshold auto-approve; above threshold require
 *   explicit approval from a role in policy.refundApprovalRoles.
 * - A PENDING_APPROVAL refund cannot be processed without approval.
 * - Approval and denial require appropriate role from refundApprovalRoles.
 */
import type { ClockPort } from "../lib/clock.js";
import type { IdFactory } from "../lib/ids.js";
import { money } from "../lib/money.js";
import type { Result } from "../lib/result.js";
import { err, ok } from "../lib/result.js";
import type { Refund } from "../domain/refund.js";
import {
  canApproveRefund,
  canDenyRefund,
  canProcessRefund,
  classifyRefund,
} from "../domain/refund.js";
import type { CustomerTier } from "../domain/account.js";
import { assertTenantOwns, assertHasRole } from "../domain/tenant.js";
import type { ActorContext } from "../domain/tenant.js";
import { TenantStore } from "../infrastructure/store.js";
import type { PolicyConfig } from "./policy.js";

export class RefundService {
  constructor(
    private readonly refundStore: TenantStore<Refund>,
    private readonly clock: ClockPort,
    private readonly ids: IdFactory,
    private readonly policy: PolicyConfig
  ) {}

  // -------------------------------------------------------------------------
  // Request
  // -------------------------------------------------------------------------

  /**
   * Create a refund request against a payment.
   * The caller must own the payment's tenant.
   *
   * @param paymentTenantId  The tenantId of the payment being refunded.
   * @param paymentId        The payment to refund.
   * @param amountMinor      Refund amount in integer minor units.
   * @param accountTier      Optional tier of the originating account.
   *                         Carried as neutral business context only.
   *                         Has NO effect on approval thresholds or policy.
   */
  requestRefund(
    actor: ActorContext,
    paymentTenantId: string,
    paymentId: string,
    amountMinor: number,
    accountTier?: CustomerTier
  ): Result<Refund, string> {
    const ownerCheck = assertTenantOwns(paymentTenantId, actor);
    if (!ownerCheck.ok) return ownerCheck;

    const now = this.clock.now();
    const status = classifyRefund(
      amountMinor,
      this.policy.refundAutoApproveThresholdMinor
    );
    const refund: Refund = {
      id: this.ids.next("refund"),
      tenantId: actor.tenantId,
      paymentId,
      requestedBy: actor.userId,
      amount: money(amountMinor, this.policy.refundCurrency),
      accountTier,
      status,
      createdAt: now,
      lastUpdatedAt: now,
    };
    this.refundStore.set(refund);
    return ok(refund);
  }

  // -------------------------------------------------------------------------
  // Approve
  // -------------------------------------------------------------------------

  /**
   * Approve a PENDING_APPROVAL refund.
   * Requires actor to hold one of the refundApprovalRoles.
   */
  approveRefund(
    actor: ActorContext,
    refundId: string
  ): Result<Refund, string> {
    const refund = this.refundStore.get(refundId);
    if (!refund) return err(`refund ${refundId} not found`);

    const ownerCheck = assertTenantOwns(refund.tenantId, actor);
    if (!ownerCheck.ok) return ownerCheck;

    const roleCheck = assertHasRole(actor, this.policy.refundApprovalRoles);
    if (!roleCheck.ok) return roleCheck;

    const canApprove = canApproveRefund(refund);
    if (!canApprove.ok) return canApprove;

    refund.status = "APPROVED";
    refund.resolvedBy = actor.userId;
    refund.lastUpdatedAt = this.clock.now();
    this.refundStore.set(refund);
    return ok(refund);
  }

  // -------------------------------------------------------------------------
  // Deny
  // -------------------------------------------------------------------------

  /**
   * Deny a PENDING_APPROVAL or APPROVED refund.
   * Requires actor to hold one of the refundApprovalRoles.
   */
  denyRefund(
    actor: ActorContext,
    refundId: string
  ): Result<Refund, string> {
    const refund = this.refundStore.get(refundId);
    if (!refund) return err(`refund ${refundId} not found`);

    const ownerCheck = assertTenantOwns(refund.tenantId, actor);
    if (!ownerCheck.ok) return ownerCheck;

    const roleCheck = assertHasRole(actor, this.policy.refundApprovalRoles);
    if (!roleCheck.ok) return roleCheck;

    const canDeny = canDenyRefund(refund);
    if (!canDeny.ok) return canDeny;

    refund.status = "DENIED";
    refund.resolvedBy = actor.userId;
    refund.lastUpdatedAt = this.clock.now();
    this.refundStore.set(refund);
    return ok(refund);
  }

  // -------------------------------------------------------------------------
  // Process
  // -------------------------------------------------------------------------

  /**
   * Mark a refund as PROCESSED.
   * Only AUTO_APPROVED or APPROVED refunds may be processed.
   * A PENDING_APPROVAL refund may NOT be processed without prior approval.
   */
  processRefund(
    actor: ActorContext,
    refundId: string
  ): Result<Refund, string> {
    const refund = this.refundStore.get(refundId);
    if (!refund) return err(`refund ${refundId} not found`);

    const ownerCheck = assertTenantOwns(refund.tenantId, actor);
    if (!ownerCheck.ok) return ownerCheck;

    const canProcess = canProcessRefund(refund);
    if (!canProcess.ok) return canProcess;

    refund.status = "PROCESSED";
    refund.lastUpdatedAt = this.clock.now();
    this.refundStore.set(refund);
    return ok(refund);
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  getRefund(actor: ActorContext, refundId: string): Result<Refund, string> {
    const refund = this.refundStore.get(refundId);
    if (!refund) return err(`refund ${refundId} not found`);
    const ownerCheck = assertTenantOwns(refund.tenantId, actor);
    if (!ownerCheck.ok) return ownerCheck;
    return ok(refund);
  }

  listRefunds(actor: ActorContext): Refund[] {
    return this.refundStore.listByTenant(actor.tenantId);
  }
}
