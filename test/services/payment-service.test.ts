import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FakeClock } from "../../src/lib/clock.js";
import { IdFactory } from "../../src/lib/ids.js";
import { money } from "../../src/lib/money.js";
import { TenantStore } from "../../src/infrastructure/store.js";
import type { Payment } from "../../src/domain/payment.js";
import { FakePaymentProcessor } from "../../src/infrastructure/fake-payment-processor.js";
import { PaymentService } from "../../src/services/payment-service.js";
import { DEFAULT_POLICY } from "../../src/services/policy.js";
import type { ActorContext } from "../../src/domain/tenant.js";

function setup() {
  const clock = new FakeClock(0);
  const ids = new IdFactory();
  const paymentStore = new TenantStore<Payment>();
  const processor = new FakePaymentProcessor();
  const service = new PaymentService(
    paymentStore,
    processor,
    clock,
    ids,
    DEFAULT_POLICY
  );

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

  return { clock, ids, paymentStore, processor, service, alpha, beta };
}

describe("PaymentService.charge()", () => {
  it("returns SUCCEEDED for a scripted SUCCESS", () => {
    const { service, processor, alpha } = setup();
    processor.script("idem-1", { outcome: "SUCCESS" });
    const r = service.charge(alpha, "acc-1", money(100_000, "INR"), "idem-1");
    assert.ok(r.ok);
    assert.equal(r.value.status, "SUCCEEDED");
    assert.equal(r.value.attempts, 1);
  });

  it("returns FAILED/TRANSIENT for a scripted TRANSIENT_FAILURE", () => {
    const { service, processor, alpha } = setup();
    processor.script("idem-2", { outcome: "TRANSIENT_FAILURE" });
    const r = service.charge(alpha, "acc-1", money(100_000, "INR"), "idem-2");
    assert.ok(r.ok);
    assert.equal(r.value.status, "FAILED");
    assert.equal(r.value.failureKind, "TRANSIENT");
  });

  it("returns FAILED/HARD_DECLINE for a scripted HARD_DECLINE", () => {
    const { service, processor, alpha } = setup();
    processor.script("idem-3", { outcome: "HARD_DECLINE" });
    const r = service.charge(alpha, "acc-1", money(100_000, "INR"), "idem-3");
    assert.ok(r.ok);
    assert.equal(r.value.status, "FAILED");
    assert.equal(r.value.failureKind, "HARD_DECLINE");
  });

  it("idempotency: second charge with same key returns first result, no second call", () => {
    const { service, processor, alpha } = setup();
    processor.script("idem-idem", { outcome: "SUCCESS" });
    service.charge(alpha, "acc-1", money(100_000, "INR"), "idem-idem");
    const totalAfterFirst = processor.totalCalls;
    const r2 = service.charge(alpha, "acc-1", money(200_000, "INR"), "idem-idem");
    assert.ok(r2.ok);
    assert.equal(r2.value.amount.amount, 100_000); // original amount returned
    assert.equal(processor.totalCalls, totalAfterFirst); // no additional call
  });
});

describe("PaymentService.retryPayment()", () => {
  it("retries a TRANSIENT payment after back-off", () => {
    const { service, processor, alpha, clock } = setup();
    processor.script("idem-retry", { outcome: "TRANSIENT_FAILURE" });
    const charge = service.charge(alpha, "acc-1", money(100_000, "INR"), "idem-retry");
    assert.ok(charge.ok);
    assert.equal(charge.value.status, "FAILED");

    // Back-off must elapse first
    const backoffMs = DEFAULT_POLICY.paymentBackoffSeconds[0]! * 1_000;
    clock.advanceMs(backoffMs);

    // Script success for the retry
    processor.script("idem-retry", { outcome: "SUCCESS" });
    const r = service.retryPayment(alpha, charge.value.id);
    assert.ok(r.ok);
    assert.equal(r.value.status, "SUCCEEDED");
    assert.equal(r.value.attempts, 2);
  });

  it("rejects retry before back-off elapses", () => {
    const { service, processor, alpha } = setup();
    processor.script("idem-backoff", { outcome: "TRANSIENT_FAILURE" });
    const charge = service.charge(alpha, "acc-1", money(100_000, "INR"), "idem-backoff");
    assert.ok(charge.ok);
    // Do NOT advance clock
    const r = service.retryPayment(alpha, charge.value.id);
    assert.ok(!r.ok);
    assert.match(r.error, /back-off has not elapsed/);
  });

  it("rejects retry of HARD_DECLINE regardless of time", () => {
    const { service, processor, alpha, clock } = setup();
    processor.script("idem-hard", { outcome: "HARD_DECLINE" });
    const charge = service.charge(alpha, "acc-1", money(100_000, "INR"), "idem-hard");
    assert.ok(charge.ok);
    clock.advanceDays(365);
    const r = service.retryPayment(alpha, charge.value.id);
    assert.ok(!r.ok);
    assert.match(r.error, /hard-declined/);
  });

  it("rejects retry after max attempts exhausted", () => {
    const { service, processor, alpha, clock } = setup();
    processor.script("idem-max", { outcome: "TRANSIENT_FAILURE" });
    const charge = service.charge(alpha, "acc-1", money(100_000, "INR"), "idem-max");
    assert.ok(charge.ok);

    // Exhaust retries (maxAttempts = 3, so 2 retries)
    for (let i = 0; i < DEFAULT_POLICY.paymentMaxAttempts - 1; i++) {
      const backoffIdx = Math.min(i, DEFAULT_POLICY.paymentBackoffSeconds.length - 1);
      clock.advanceSeconds(DEFAULT_POLICY.paymentBackoffSeconds[backoffIdx]!);
      service.retryPayment(alpha, charge.value.id);
    }

    // One more retry attempt — should fail with limit message
    clock.advanceDays(1);
    const r = service.retryPayment(alpha, charge.value.id);
    assert.ok(!r.ok);
    assert.match(r.error, /maximum attempt limit/);
  });
});

describe("PaymentService tenant isolation", () => {
  it("beta actor cannot access alpha payment", () => {
    const { service, processor, alpha, beta } = setup();
    processor.script("idem-iso", { outcome: "SUCCESS" });
    const charge = service.charge(alpha, "acc-1", money(100_000, "INR"), "idem-iso");
    assert.ok(charge.ok);
    const r = service.getPayment(beta, charge.value.id);
    assert.ok(!r.ok);
    assert.match(r.error, /isolation violation/);
  });
});
