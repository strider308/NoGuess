import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Refund } from "../../src/domain/refund.js";
import {
  classifyRefund,
  canApproveRefund,
  canDenyRefund,
  canProcessRefund,
} from "../../src/domain/refund.js";
import { money } from "../../src/lib/money.js";

const THRESHOLD = 1_000_000; // ₹10,000 in paise

function makeRefund(overrides: Partial<Refund> = {}): Refund {
  return {
    id: "refund-1",
    tenantId: "tenant-alpha",
    paymentId: "pay-1",
    requestedBy: "user-1",
    amount: money(500_000, "INR"),
    status: "PENDING_APPROVAL",
    createdAt: 0,
    lastUpdatedAt: 0,
    ...overrides,
  };
}

describe("classifyRefund()", () => {
  it("auto-approves refunds at the threshold", () => {
    assert.equal(classifyRefund(THRESHOLD, THRESHOLD), "AUTO_APPROVED");
  });

  it("auto-approves refunds below the threshold", () => {
    assert.equal(classifyRefund(THRESHOLD - 1, THRESHOLD), "AUTO_APPROVED");
  });

  it("requires approval for refunds above the threshold", () => {
    assert.equal(classifyRefund(THRESHOLD + 1, THRESHOLD), "PENDING_APPROVAL");
  });

  it("requires approval for zero threshold (all above zero require approval)", () => {
    assert.equal(classifyRefund(1, 0), "PENDING_APPROVAL");
  });

  it("auto-approves zero amount at zero threshold", () => {
    assert.equal(classifyRefund(0, 0), "AUTO_APPROVED");
  });
});

describe("canApproveRefund()", () => {
  it("allows approval of PENDING_APPROVAL refund", () => {
    assert.ok(canApproveRefund(makeRefund({ status: "PENDING_APPROVAL" })).ok);
  });

  it("rejects approval of AUTO_APPROVED refund", () => {
    const r = canApproveRefund(makeRefund({ status: "AUTO_APPROVED" }));
    assert.ok(!r.ok);
  });

  it("rejects approval of PROCESSED refund", () => {
    const r = canApproveRefund(makeRefund({ status: "PROCESSED" }));
    assert.ok(!r.ok);
  });

  it("rejects approval of DENIED refund", () => {
    const r = canApproveRefund(makeRefund({ status: "DENIED" }));
    assert.ok(!r.ok);
  });
});

describe("canDenyRefund()", () => {
  it("allows denial of PENDING_APPROVAL refund", () => {
    assert.ok(canDenyRefund(makeRefund({ status: "PENDING_APPROVAL" })).ok);
  });

  it("allows denial of APPROVED refund", () => {
    assert.ok(canDenyRefund(makeRefund({ status: "APPROVED" })).ok);
  });

  it("rejects denial of already DENIED refund", () => {
    const r = canDenyRefund(makeRefund({ status: "DENIED" }));
    assert.ok(!r.ok);
  });

  it("rejects denial of PROCESSED refund", () => {
    const r = canDenyRefund(makeRefund({ status: "PROCESSED" }));
    assert.ok(!r.ok);
  });
});

describe("canProcessRefund()", () => {
  it("allows processing of AUTO_APPROVED refund", () => {
    assert.ok(canProcessRefund(makeRefund({ status: "AUTO_APPROVED" })).ok);
  });

  it("allows processing of APPROVED refund", () => {
    assert.ok(canProcessRefund(makeRefund({ status: "APPROVED" })).ok);
  });

  it("rejects processing of PENDING_APPROVAL — no approval yet", () => {
    const r = canProcessRefund(makeRefund({ status: "PENDING_APPROVAL" }));
    assert.ok(!r.ok);
    assert.match(r.error, /must be AUTO_APPROVED or APPROVED/);
  });

  it("rejects processing of DENIED refund", () => {
    const r = canProcessRefund(makeRefund({ status: "DENIED" }));
    assert.ok(!r.ok);
  });
});
