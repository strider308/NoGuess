import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { WebhookDelivery } from "../../src/domain/webhook.js";
import { isDeliveryRetryEligible } from "../../src/domain/webhook.js";

function makeDelivery(overrides: Partial<WebhookDelivery> = {}): WebhookDelivery {
  return {
    id: "del-1",
    subscriptionId: "wh-1",
    tenantId: "tenant-alpha",
    eventType: "order.completed",
    payload: {},
    status: "FAILED",
    attempts: 1,
    createdAt: 0,
    ...overrides,
  };
}

const MAX_RETRIES = 3;

describe("isDeliveryRetryEligible()", () => {
  it("succeeds for a FAILED delivery under the retry limit", () => {
    assert.ok(isDeliveryRetryEligible(makeDelivery({ attempts: 1 }), MAX_RETRIES).ok);
  });

  it("fails when status is DELIVERED", () => {
    const r = isDeliveryRetryEligible(makeDelivery({ status: "DELIVERED" }), MAX_RETRIES);
    assert.ok(!r.ok);
    assert.match(r.error, /not in FAILED status/);
  });

  it("fails when status is PENDING", () => {
    const r = isDeliveryRetryEligible(makeDelivery({ status: "PENDING" }), MAX_RETRIES);
    assert.ok(!r.ok);
  });

  it("fails when attempts has reached max retries", () => {
    const r = isDeliveryRetryEligible(makeDelivery({ attempts: 3 }), MAX_RETRIES);
    assert.ok(!r.ok);
    assert.match(r.error, /max retries/);
  });

  it("passes at attempts = maxRetries - 1", () => {
    const r = isDeliveryRetryEligible(makeDelivery({ attempts: 2 }), MAX_RETRIES);
    assert.ok(r.ok);
  });
});
