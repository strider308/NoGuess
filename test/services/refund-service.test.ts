import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FakeClock } from "../../src/lib/clock.js";
import { IdFactory } from "../../src/lib/ids.js";
import { TenantStore } from "../../src/infrastructure/store.js";
import type { Refund } from "../../src/domain/refund.js";
import { RefundService } from "../../src/services/refund-service.js";
import { DEFAULT_POLICY } from "../../src/services/policy.js";
import type { ActorContext } from "../../src/domain/tenant.js";

const THRESHOLD = DEFAULT_POLICY.refundAutoApproveThresholdMinor; // 1_000_000

function setup() {
  const clock = new FakeClock(0);
  const ids = new IdFactory();
  const refundStore = new TenantStore<Refund>();
  const service = new RefundService(refundStore, clock, ids, DEFAULT_POLICY);

  const admin: ActorContext = {
    tenantId: "tenant-alpha",
    userId: "user-admin",
    roles: ["ADMIN"],
  };
  const manager: ActorContext = {
    tenantId: "tenant-alpha",
    userId: "user-manager",
    roles: ["MANAGER"],
  };
  const member: ActorContext = {
    tenantId: "tenant-alpha",
    userId: "user-member",
    roles: ["MEMBER"],
  };

  return { clock, ids, refundStore, service, admin, manager, member };
}

describe("RefundService.requestRefund() — below threshold", () => {
  it("auto-approves a refund at the threshold", () => {
    const { service, admin } = setup();
    const r = service.requestRefund(admin, "tenant-alpha", "pay-1", THRESHOLD);
    assert.ok(r.ok);
    assert.equal(r.value.status, "AUTO_APPROVED");
  });

  it("auto-approves a refund below the threshold", () => {
    const { service, admin } = setup();
    const r = service.requestRefund(admin, "tenant-alpha", "pay-1", THRESHOLD - 1);
    assert.ok(r.ok);
    assert.equal(r.value.status, "AUTO_APPROVED");
  });
});

describe("RefundService.requestRefund() — above threshold", () => {
  it("puts a large refund into PENDING_APPROVAL", () => {
    const { service, admin } = setup();
    const r = service.requestRefund(admin, "tenant-alpha", "pay-1", THRESHOLD + 1);
    assert.ok(r.ok);
    assert.equal(r.value.status, "PENDING_APPROVAL");
  });
});

describe("RefundService approval flow", () => {
  it("ADMIN can approve a PENDING_APPROVAL refund", () => {
    const { service, admin } = setup();
    const req = service.requestRefund(admin, "tenant-alpha", "pay-1", THRESHOLD + 1);
    assert.ok(req.ok);
    const approve = service.approveRefund(admin, req.value.id);
    assert.ok(approve.ok);
    assert.equal(approve.value.status, "APPROVED");
    assert.equal(approve.value.resolvedBy, "user-admin");
  });

  it("MANAGER can approve a PENDING_APPROVAL refund", () => {
    const { service, admin, manager } = setup();
    const req = service.requestRefund(admin, "tenant-alpha", "pay-1", THRESHOLD + 1);
    assert.ok(req.ok);
    const approve = service.approveRefund(manager, req.value.id);
    assert.ok(approve.ok);
  });

  it("MEMBER cannot approve a refund", () => {
    const { service, admin, member } = setup();
    const req = service.requestRefund(admin, "tenant-alpha", "pay-1", THRESHOLD + 1);
    assert.ok(req.ok);
    const r = service.approveRefund(member, req.value.id);
    assert.ok(!r.ok);
    assert.match(r.error, /authorization denied/);
  });

  it("PENDING_APPROVAL refund cannot be processed without approval", () => {
    const { service, admin } = setup();
    const req = service.requestRefund(admin, "tenant-alpha", "pay-1", THRESHOLD + 1);
    assert.ok(req.ok);
    assert.equal(req.value.status, "PENDING_APPROVAL");
    const process = service.processRefund(admin, req.value.id);
    assert.ok(!process.ok);
    assert.match(process.error, /must be AUTO_APPROVED or APPROVED/);
  });

  it("approved refund can be processed", () => {
    const { service, admin } = setup();
    const req = service.requestRefund(admin, "tenant-alpha", "pay-1", THRESHOLD + 1);
    assert.ok(req.ok);
    service.approveRefund(admin, req.value.id);
    const process = service.processRefund(admin, req.value.id);
    assert.ok(process.ok);
    assert.equal(process.value.status, "PROCESSED");
  });

  it("auto-approved refund can be processed directly", () => {
    const { service, admin } = setup();
    const req = service.requestRefund(admin, "tenant-alpha", "pay-1", THRESHOLD);
    assert.ok(req.ok);
    assert.equal(req.value.status, "AUTO_APPROVED");
    const process = service.processRefund(admin, req.value.id);
    assert.ok(process.ok);
    assert.equal(process.value.status, "PROCESSED");
  });
});

describe("RefundService.denyRefund()", () => {
  it("ADMIN can deny a PENDING_APPROVAL refund", () => {
    const { service, admin } = setup();
    const req = service.requestRefund(admin, "tenant-alpha", "pay-1", THRESHOLD + 1);
    assert.ok(req.ok);
    const r = service.denyRefund(admin, req.value.id);
    assert.ok(r.ok);
    assert.equal(r.value.status, "DENIED");
  });

  it("cannot deny an already PROCESSED refund", () => {
    const { service, admin } = setup();
    const req = service.requestRefund(admin, "tenant-alpha", "pay-1", THRESHOLD);
    assert.ok(req.ok);
    service.processRefund(admin, req.value.id);
    const r = service.denyRefund(admin, req.value.id);
    assert.ok(!r.ok);
  });
});

describe("RefundService tenant isolation", () => {
  it("beta actor cannot access alpha refund", () => {
    const { service, admin } = setup();
    const betaActor: ActorContext = {
      tenantId: "tenant-beta",
      userId: "user-beta",
      roles: ["ADMIN"],
    };
    const req = service.requestRefund(admin, "tenant-alpha", "pay-1", THRESHOLD);
    assert.ok(req.ok);
    const r = service.getRefund(betaActor, req.value.id);
    assert.ok(!r.ok);
    assert.match(r.error, /isolation violation/);
  });
});
