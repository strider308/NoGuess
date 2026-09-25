import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Payment } from "../../src/domain/payment.js";
import { isRetryEligible } from "../../src/domain/payment.js";
import { money } from "../../src/lib/money.js";

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pay-1",
    tenantId: "tenant-alpha",
    accountId: "acc-1",
    idempotencyKey: "idem-1",
    amount: money(100_000, "INR"),
    status: "FAILED",
    failureKind: "TRANSIENT",
    attempts: 1,
    nextRetryAt: 1_000,
    createdAt: 0,
    lastUpdatedAt: 0,
    ...overrides,
  };
}

const MAX_ATTEMPTS = 3;

describe("isRetryEligible()", () => {
  it("succeeds when all conditions are met", () => {
    const payment = makePayment();
    const r = isRetryEligible(payment, 2_000, MAX_ATTEMPTS);
    assert.ok(r.ok);
  });

  it("fails when status is not FAILED", () => {
    const payment = makePayment({ status: "SUCCEEDED" });
    const r = isRetryEligible(payment, 2_000, MAX_ATTEMPTS);
    assert.ok(!r.ok);
    assert.match(r.error, /not in FAILED status/);
  });

  it("fails for HARD_DECLINE regardless of time elapsed", () => {
    const payment = makePayment({
      failureKind: "HARD_DECLINE",
      nextRetryAt: 0, // back-off already elapsed
    });
    const r = isRetryEligible(payment, 999_999, MAX_ATTEMPTS);
    assert.ok(!r.ok);
    assert.match(r.error, /hard-declined/);
  });

  it("fails when attempt limit is reached", () => {
    const payment = makePayment({ attempts: 3 });
    const r = isRetryEligible(payment, 2_000, MAX_ATTEMPTS);
    assert.ok(!r.ok);
    assert.match(r.error, /maximum attempt limit/);
  });

  it("fails when back-off has not elapsed", () => {
    const payment = makePayment({ nextRetryAt: 5_000 });
    const r = isRetryEligible(payment, 3_000, MAX_ATTEMPTS);
    assert.ok(!r.ok);
    assert.match(r.error, /back-off has not elapsed/);
  });

  it("passes exactly when back-off elapses", () => {
    const payment = makePayment({ nextRetryAt: 5_000 });
    // At exactly nextRetryAt it is still blocked (nowMs < nextRetryAt is false iff >=)
    // nowMs === nextRetryAt → NOT blocked (5000 < 5000 is false)
    const rExact = isRetryEligible(payment, 5_000, MAX_ATTEMPTS);
    assert.ok(rExact.ok);
  });

  it("HARD_DECLINE is never retryable even after many seconds", () => {
    const payment = makePayment({
      failureKind: "HARD_DECLINE",
      nextRetryAt: undefined,
    });
    const r = isRetryEligible(payment, Number.MAX_SAFE_INTEGER, MAX_ATTEMPTS);
    assert.ok(!r.ok);
  });
});
