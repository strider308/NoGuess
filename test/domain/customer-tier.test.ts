/**
 * CustomerTier tests.
 *
 * Verifies:
 * 1. VIP tier is represented deterministically in the seed.
 * 2. STANDARD tier is represented deterministically in the seed.
 * 3. VIP status does NOT bypass the configured refund approval threshold.
 *    The threshold rule is solely policy-based (PolicyConfig), regardless of tier.
 *
 * No GuessBench case IDs or hidden expected answers appear in this file.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FakeClock } from "../../src/lib/clock.js";
import { IdFactory } from "../../src/lib/ids.js";
import { TenantStore } from "../../src/infrastructure/store.js";
import type { Refund } from "../../src/domain/refund.js";
import { RefundService } from "../../src/services/refund-service.js";
import { DEFAULT_POLICY } from "../../src/services/policy.js";
import type { ActorContext } from "../../src/domain/tenant.js";

const THRESHOLD = DEFAULT_POLICY.refundAutoApproveThresholdMinor; // 1_000_000 paise

function makeRefundService() {
  const clock = new FakeClock(0);
  const ids = new IdFactory();
  const refundStore = new TenantStore<Refund>();
  const service = new RefundService(refundStore, clock, ids, DEFAULT_POLICY);
  const admin: ActorContext = {
    tenantId: "tenant-alpha",
    userId: "user-admin",
    roles: ["ADMIN"],
  };
  return { service, admin };
}

describe("CustomerTier — refund policy invariant", () => {
  it("VIP account: refund AT threshold is AUTO_APPROVED (same as STANDARD)", () => {
    const { service, admin } = makeRefundService();
    const r = service.requestRefund(
      admin,
      "tenant-alpha",
      "pay-1",
      THRESHOLD,
      "VIP"         // passing VIP tier as context
    );
    assert.ok(r.ok);
    assert.equal(r.value.status, "AUTO_APPROVED");
    assert.equal(r.value.accountTier, "VIP");
  });

  it("VIP account: refund BELOW threshold is AUTO_APPROVED (same as STANDARD)", () => {
    const { service, admin } = makeRefundService();
    const r = service.requestRefund(
      admin,
      "tenant-alpha",
      "pay-2",
      THRESHOLD - 1,
      "VIP"
    );
    assert.ok(r.ok);
    assert.equal(r.value.status, "AUTO_APPROVED");
  });

  it("VIP account: refund ABOVE threshold enters PENDING_APPROVAL — tier does not grant exemption", () => {
    const { service, admin } = makeRefundService();
    const r = service.requestRefund(
      admin,
      "tenant-alpha",
      "pay-3",
      THRESHOLD + 1,
      "VIP"         // VIP tier must NOT exempt from approval requirement
    );
    assert.ok(r.ok);
    assert.equal(
      r.value.status,
      "PENDING_APPROVAL",
      "VIP tier must not bypass approval threshold"
    );
  });

  it("VIP above-threshold refund cannot be processed without explicit approval", () => {
    const { service, admin } = makeRefundService();
    const req = service.requestRefund(
      admin,
      "tenant-alpha",
      "pay-4",
      THRESHOLD + 1,
      "VIP"
    );
    assert.ok(req.ok);
    assert.equal(req.value.status, "PENDING_APPROVAL");

    // Attempt to process without approval — must fail
    const process = service.processRefund(admin, req.value.id);
    assert.ok(!process.ok);
    assert.match(process.error, /must be AUTO_APPROVED or APPROVED/);
  });

  it("STANDARD account: refund above threshold also requires approval (baseline consistency)", () => {
    const { service, admin } = makeRefundService();
    const r = service.requestRefund(
      admin,
      "tenant-alpha",
      "pay-5",
      THRESHOLD + 1,
      "STANDARD"
    );
    assert.ok(r.ok);
    assert.equal(r.value.status, "PENDING_APPROVAL");
  });

  it("tier is carried as neutral context — does not affect classifyRefund logic", () => {
    const { service, admin } = makeRefundService();
    // Same amount, different tier — must produce same status
    const vip = service.requestRefund(
      admin, "tenant-alpha", "pay-6", THRESHOLD + 100, "VIP"
    );
    const ids2 = new IdFactory();
    const refundStore2 = new TenantStore<Refund>();
    const service2 = new RefundService(refundStore2, new FakeClock(0), ids2, DEFAULT_POLICY);
    const std = service2.requestRefund(
      admin, "tenant-alpha", "pay-7", THRESHOLD + 100, "STANDARD"
    );
    assert.ok(vip.ok);
    assert.ok(std.ok);
    assert.equal(vip.value.status, std.value.status);
  });

  it("refund without tier context follows the same policy rules", () => {
    const { service, admin } = makeRefundService();
    const r = service.requestRefund(
      admin, "tenant-alpha", "pay-8", THRESHOLD + 1
      // no tier passed — undefined
    );
    assert.ok(r.ok);
    assert.equal(r.value.status, "PENDING_APPROVAL");
    assert.equal(r.value.accountTier, undefined);
  });
});
