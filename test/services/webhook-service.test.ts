import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FakeClock } from "../../src/lib/clock.js";
import { IdFactory } from "../../src/lib/ids.js";
import { TenantStore } from "../../src/infrastructure/store.js";
import type { WebhookSubscription, WebhookDelivery } from "../../src/domain/webhook.js";
import { WebhookService } from "../../src/services/webhook-service.js";
import { DEFAULT_POLICY } from "../../src/services/policy.js";
import type { ActorContext } from "../../src/domain/tenant.js";

function setup() {
  const clock = new FakeClock(0);
  const ids = new IdFactory();
  const subStore = new TenantStore<WebhookSubscription>();
  const deliveryStore = new TenantStore<WebhookDelivery>();
  const service = new WebhookService(subStore, deliveryStore, clock, ids, DEFAULT_POLICY);

  const alpha: ActorContext = {
    tenantId: "tenant-alpha",
    userId: "user-admin",
    roles: ["ADMIN"],
  };
  const beta: ActorContext = {
    tenantId: "tenant-beta",
    userId: "user-beta",
    roles: ["ADMIN"],
  };

  return { clock, ids, subStore, deliveryStore, service, alpha, beta };
}

describe("WebhookService — multiple subscriptions per tenant", () => {
  it("allows multiple active subscriptions for the same tenant and event type", () => {
    const { service, alpha } = setup();
    service.registerWebhook(alpha, "order.completed", "endpoint-1", () => true);
    service.registerWebhook(alpha, "order.completed", "endpoint-2", () => true);
    const subs = service.listSubscriptions(alpha);
    assert.equal(subs.length, 2);
    assert.ok(subs.every((s) => s.status === "ACTIVE"));
  });
});

describe("WebhookService.deliverEvent()", () => {
  it("delivers to all matching ACTIVE subscriptions", () => {
    const { service, alpha } = setup();
    service.registerWebhook(alpha, "order.completed", "ep-1", () => true);
    service.registerWebhook(alpha, "order.completed", "ep-2", () => true);
    service.registerWebhook(alpha, "payment.failed", "ep-3", () => true);

    const r = service.deliverEvent(alpha, "order.completed", { orderId: "123" });
    assert.ok(r.ok);
    assert.equal(r.value.length, 2); // only the two "order.completed" subscriptions
    assert.ok(r.value.every((d) => d.status === "DELIVERED"));
  });

  it("records a FAILED delivery when handler returns false", () => {
    const { service, alpha } = setup();
    service.registerWebhook(alpha, "order.completed", "ep-fail", () => false);
    const r = service.deliverEvent(alpha, "order.completed", {});
    assert.ok(r.ok);
    assert.equal(r.value[0]?.status, "FAILED");
  });

  it("skips PAUSED subscriptions", () => {
    const { service, alpha } = setup();
    const reg = service.registerWebhook(alpha, "order.completed", "ep-paused", () => true);
    assert.ok(reg.ok);
    service.pauseWebhook(alpha, reg.value.id);
    const r = service.deliverEvent(alpha, "order.completed", {});
    assert.ok(r.ok);
    assert.equal(r.value.length, 0);
  });
});

describe("WebhookService.retryFailedDeliveries()", () => {
  it("retries FAILED deliveries under the retry limit", () => {
    const { service, alpha } = setup();
    // First call fails, second succeeds
    let callCount = 0;
    service.registerWebhook(alpha, "order.completed", "ep-retry", () => {
      callCount += 1;
      return callCount > 1; // fail on first, succeed on second
    });
    const deliver = service.deliverEvent(alpha, "order.completed", { id: "1" });
    assert.ok(deliver.ok);
    assert.equal(deliver.value[0]?.status, "FAILED");

    const retried = service.retryFailedDeliveries(alpha);
    assert.ok(retried.ok);
    assert.equal(retried.value.length, 1);
    assert.equal(retried.value[0]?.status, "DELIVERED");
  });

  it("stops retrying after max retries", () => {
    const { service, alpha } = setup();
    // Always fails
    service.registerWebhook(alpha, "order.completed", "ep-always-fail", () => false);
    service.deliverEvent(alpha, "order.completed", {});

    // Retry up to the limit
    for (let i = 0; i < DEFAULT_POLICY.webhookMaxRetries - 1; i++) {
      service.retryFailedDeliveries(alpha);
    }

    // Deliveries should now be at max retries and not retried further
    const finalRetry = service.retryFailedDeliveries(alpha);
    assert.ok(finalRetry.ok);
    assert.equal(finalRetry.value.length, 0); // nothing retried (limit reached)
  });
});

describe("WebhookService tenant isolation", () => {
  it("beta actor sees only beta deliveries", () => {
    const { service, alpha, beta } = setup();
    service.registerWebhook(alpha, "order.completed", "ep-alpha", () => true);
    service.deliverEvent(alpha, "order.completed", { id: "alpha-event" });

    const betaDeliveries = service.listDeliveries(beta);
    assert.equal(betaDeliveries.length, 0);
  });
});
