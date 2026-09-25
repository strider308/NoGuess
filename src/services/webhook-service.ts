/**
 * WebhookService — register subscriptions, deliver events, retry failures.
 *
 * Invariants enforced:
 * - Tenant isolation on all operations.
 * - Multiple active subscriptions per tenant are supported.
 * - Every delivery attempt is recorded regardless of outcome.
 * - Retry eligibility respects webhookMaxRetries from PolicyConfig.
 *
 * "Delivery" in this fixture is an in-memory function call — no HTTP.
 * The fake handler result determines whether the delivery is DELIVERED or FAILED.
 */
import type { ClockPort } from "../lib/clock.js";
import type { IdFactory } from "../lib/ids.js";
import type { Result } from "../lib/result.js";
import { err, ok } from "../lib/result.js";
import type { WebhookDelivery, WebhookSubscription } from "../domain/webhook.js";
import { isDeliveryRetryEligible } from "../domain/webhook.js";
import { assertAuthorized, assertTenantOwns } from "../domain/tenant.js";
import type { ActorContext } from "../domain/tenant.js";
import { TenantStore } from "../infrastructure/store.js";
import type { PolicyConfig } from "./policy.js";

/**
 * A fake delivery handler: receives the payload and returns true (success)
 * or false (failure). Scripted by tests — no network.
 */
export type FakeDeliveryHandler = (
  payload: Record<string, unknown>
) => boolean;

export class WebhookService {
  /** Map from subscriptionId to its fake handler. */
  private readonly handlers = new Map<string, FakeDeliveryHandler>();

  constructor(
    private readonly subscriptionStore: TenantStore<WebhookSubscription>,
    private readonly deliveryStore: TenantStore<WebhookDelivery>,
    private readonly clock: ClockPort,
    private readonly ids: IdFactory,
    private readonly policy: PolicyConfig
  ) {}

  // -------------------------------------------------------------------------
  // Subscriptions
  // -------------------------------------------------------------------------

  /**
   * Register a webhook subscription for the actor's tenant.
   * Multiple subscriptions with the same eventType are allowed.
   */
  registerWebhook(
    actor: ActorContext,
    eventType: string,
    endpointLabel: string,
    handler: FakeDeliveryHandler
  ): Result<WebhookSubscription, string> {
    const sub: WebhookSubscription = {
      id: this.ids.next("webhook"),
      tenantId: actor.tenantId,
      eventType,
      endpointLabel,
      status: "ACTIVE",
      createdAt: this.clock.now(),
    };
    this.subscriptionStore.set(sub);
    this.handlers.set(sub.id, handler);
    return ok(sub);
  }

  pauseWebhook(
    actor: ActorContext,
    subscriptionId: string
  ): Result<WebhookSubscription, string> {
    return this.setStatus(actor, subscriptionId, "PAUSED");
  }

  resumeWebhook(
    actor: ActorContext,
    subscriptionId: string
  ): Result<WebhookSubscription, string> {
    return this.setStatus(actor, subscriptionId, "ACTIVE");
  }

  deleteWebhook(
    actor: ActorContext,
    subscriptionId: string
  ): Result<WebhookSubscription, string> {
    return this.setStatus(actor, subscriptionId, "DELETED");
  }

  // -------------------------------------------------------------------------
  // Delivery
  // -------------------------------------------------------------------------

  /**
   * Deliver an event to all ACTIVE subscriptions matching the eventType
   * within the actor's tenant.
   * Returns all delivery records created (one per matching subscription).
   */
  deliverEvent(
    actor: ActorContext,
    eventType: string,
    payload: Record<string, unknown>
  ): Result<WebhookDelivery[], string> {
    const authCheck = assertAuthorized(actor.tenantId, actor, ["ADMIN", "MANAGER", "BILLING", "SUPPORT", "MEMBER"]);
    if (!authCheck.ok) return authCheck;

    const subs = this.subscriptionStore
      .listByTenant(actor.tenantId)
      .filter((s) => s.status === "ACTIVE" && s.eventType === eventType);

    const deliveries: WebhookDelivery[] = [];
    const now = this.clock.now();

    for (const sub of subs) {
      const delivery = this.attemptDelivery(sub, payload, now);
      deliveries.push(delivery);
    }

    return ok(deliveries);
  }

  /**
   * Retry all FAILED deliveries for the actor's tenant that are still
   * within the retry limit.
   */
  retryFailedDeliveries(actor: ActorContext): Result<WebhookDelivery[], string> {
    const authCheck = assertAuthorized(actor.tenantId, actor, ["ADMIN", "MANAGER"]);
    if (!authCheck.ok) return authCheck;

    const failed = this.deliveryStore
      .listByTenant(actor.tenantId)
      .filter((d) => d.status === "FAILED");

    const retried: WebhookDelivery[] = [];
    const now = this.clock.now();

    for (const delivery of failed) {
      const eligible = isDeliveryRetryEligible(
        delivery,
        this.policy.webhookMaxRetries
      );
      if (!eligible.ok) continue;

      const sub = this.subscriptionStore.get(delivery.subscriptionId);
      if (!sub || sub.status !== "ACTIVE") continue;

      this.reattemptDelivery(delivery, sub, now);
      retried.push(delivery);
    }

    return ok(retried);
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  listSubscriptions(actor: ActorContext): WebhookSubscription[] {
    return this.subscriptionStore.listByTenant(actor.tenantId);
  }

  listDeliveries(actor: ActorContext): WebhookDelivery[] {
    return this.deliveryStore.listByTenant(actor.tenantId);
  }

  getDelivery(
    actor: ActorContext,
    deliveryId: string
  ): Result<WebhookDelivery, string> {
    const delivery = this.deliveryStore.get(deliveryId);
    if (!delivery) return err(`delivery ${deliveryId} not found`);
    const ownerCheck = assertTenantOwns(delivery.tenantId, actor);
    if (!ownerCheck.ok) return ownerCheck;
    return ok(delivery);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private attemptDelivery(
    sub: WebhookSubscription,
    payload: Record<string, unknown>,
    nowMs: number
  ): WebhookDelivery {
    const handler = this.handlers.get(sub.id);
    const success = handler ? handler(payload) : true; // default: succeed

    const delivery: WebhookDelivery = {
      id: this.ids.next("delivery"),
      subscriptionId: sub.id,
      tenantId: sub.tenantId,
      eventType: sub.eventType,
      payload,
      status: success ? "DELIVERED" : "FAILED",
      attempts: 1,
      createdAt: nowMs,
      lastAttemptAt: nowMs,
    };
    this.deliveryStore.set(delivery);
    return delivery;
  }

  private reattemptDelivery(
    delivery: WebhookDelivery,
    sub: WebhookSubscription,
    nowMs: number
  ): void {
    const handler = this.handlers.get(sub.id);
    const success = handler ? handler(delivery.payload) : true;

    delivery.attempts += 1;
    delivery.status = success ? "DELIVERED" : "FAILED";
    delivery.lastAttemptAt = nowMs;
    this.deliveryStore.set(delivery);
  }

  private setStatus(
    actor: ActorContext,
    subscriptionId: string,
    status: WebhookSubscription["status"]
  ): Result<WebhookSubscription, string> {
    const sub = this.subscriptionStore.get(subscriptionId);
    if (!sub) return err(`webhook subscription ${subscriptionId} not found`);

    const ownerCheck = assertTenantOwns(sub.tenantId, actor);
    if (!ownerCheck.ok) return ownerCheck;

    sub.status = status;
    this.subscriptionStore.set(sub);
    return ok(sub);
  }
}
