/**
 * PaymentService — charge, idempotency, and retry.
 *
 * Invariants enforced:
 * - Tenant isolation: actor must own the account being charged.
 * - Idempotency: submitting the same idempotencyKey returns the first result.
 * - Retry: only FAILED/TRANSIENT payments may be retried, within attempt
 *   limits and back-off constraints from PolicyConfig.
 * - HARD_DECLINE payments are never retryable.
 */
import type { ClockPort } from "../lib/clock.js";
import type { IdFactory } from "../lib/ids.js";
import type { Money } from "../lib/money.js";
import type { Result } from "../lib/result.js";
import { err, ok } from "../lib/result.js";
import type { Payment } from "../domain/payment.js";
import { isRetryEligible } from "../domain/payment.js";
import { assertTenantOwns } from "../domain/tenant.js";
import type { ActorContext } from "../domain/tenant.js";
import { TenantStore } from "../infrastructure/store.js";
import type { FakePaymentProcessor } from "../infrastructure/fake-payment-processor.js";
import type { PolicyConfig } from "./policy.js";

export class PaymentService {
  /** Secondary index: idempotencyKey → paymentId */
  private readonly idempotencyIndex = new Map<string, string>();

  constructor(
    private readonly paymentStore: TenantStore<Payment>,
    private readonly processor: FakePaymentProcessor,
    private readonly clock: ClockPort,
    private readonly ids: IdFactory,
    private readonly policy: PolicyConfig
  ) {}

  // -------------------------------------------------------------------------
  // Charge
  // -------------------------------------------------------------------------

  /**
   * Attempt a payment charge.
   * If the idempotencyKey has been seen before, return the existing record.
   */
  charge(
    actor: ActorContext,
    accountId: string,
    amount: Money,
    idempotencyKey: string
  ): Result<Payment, string> {
    // Idempotency check first.
    const existingId = this.idempotencyIndex.get(idempotencyKey);
    if (existingId) {
      const existing = this.paymentStore.get(existingId);
      if (existing) {
        // Still verify tenant ownership before returning.
        const ownerCheck = assertTenantOwns(existing.tenantId, actor);
        if (!ownerCheck.ok) return ownerCheck;
        return ok(existing);
      }
    }

    const now = this.clock.now();
    const paymentId = this.ids.next("payment");

    const payment: Payment = {
      id: paymentId,
      tenantId: actor.tenantId,
      accountId,
      idempotencyKey,
      amount,
      status: "PROCESSING",
      attempts: 0,
      createdAt: now,
      lastUpdatedAt: now,
    };
    this.paymentStore.set(payment);
    this.idempotencyIndex.set(idempotencyKey, paymentId);

    this.applyProcessorResult(payment, idempotencyKey, now);
    this.paymentStore.set(payment);
    return ok(payment);
  }

  // -------------------------------------------------------------------------
  // Retry
  // -------------------------------------------------------------------------

  /**
   * Retry a failed TRANSIENT payment.
   * Enforces attempt limits and back-off from PolicyConfig.
   */
  retryPayment(
    actor: ActorContext,
    paymentId: string
  ): Result<Payment, string> {
    const payment = this.paymentStore.get(paymentId);
    if (!payment) return err(`payment ${paymentId} not found`);

    const ownerCheck = assertTenantOwns(payment.tenantId, actor);
    if (!ownerCheck.ok) return ownerCheck;

    const eligibilityCheck = isRetryEligible(
      payment,
      this.clock.now(),
      this.policy.paymentMaxAttempts
    );
    if (!eligibilityCheck.ok) return eligibilityCheck;

    const now = this.clock.now();
    payment.status = "PROCESSING";
    delete payment.failureKind;
    delete payment.nextRetryAt;
    payment.lastUpdatedAt = now;

    this.applyProcessorResult(payment, payment.idempotencyKey, now);
    this.paymentStore.set(payment);
    return ok(payment);
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  getPayment(
    actor: ActorContext,
    paymentId: string
  ): Result<Payment, string> {
    const payment = this.paymentStore.get(paymentId);
    if (!payment) return err(`payment ${paymentId} not found`);
    const ownerCheck = assertTenantOwns(payment.tenantId, actor);
    if (!ownerCheck.ok) return ownerCheck;
    return ok(payment);
  }

  listPayments(actor: ActorContext): Payment[] {
    return this.paymentStore.listByTenant(actor.tenantId);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private applyProcessorResult(
    payment: Payment,
    idempotencyKey: string,
    now: number
  ): void {
    payment.attempts += 1;
    const result = this.processor.process(idempotencyKey);

    if (result.success) {
      payment.status = "SUCCEEDED";
    } else {
      payment.status = "FAILED";
      payment.failureKind = result.failureKind;
      // Compute next retry back-off time.
      const backoffIndex = Math.min(
        payment.attempts - 1,
        this.policy.paymentBackoffSeconds.length - 1
      );
      const backoffSeconds =
        this.policy.paymentBackoffSeconds[backoffIndex] ?? 0;
      payment.nextRetryAt = now + backoffSeconds * 1_000;
    }
    payment.lastUpdatedAt = now;
  }
}
