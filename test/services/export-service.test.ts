import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FakeClock } from "../../src/lib/clock.js";
import { IdFactory } from "../../src/lib/ids.js";
import { TenantStore } from "../../src/infrastructure/store.js";
import type { ExportJob } from "../../src/domain/export.js";
import type { Payment } from "../../src/domain/payment.js";
import { ExportService } from "../../src/services/export-service.js";
import type { ActorContext } from "../../src/domain/tenant.js";
import { money } from "../../src/lib/money.js";

function setup() {
  const clock = new FakeClock(0);
  const ids = new IdFactory();
  const exportStore = new TenantStore<ExportJob>();
  const paymentStore = new TenantStore<Payment>();

  // Seed alpha payments
  const alphaPayment: Payment = {
    id: "pay-alpha-1",
    tenantId: "tenant-alpha",
    accountId: "acc-1",
    idempotencyKey: "idem-1",
    amount: money(100_000, "INR"),
    status: "SUCCEEDED",
    attempts: 1,
    createdAt: 0,
    lastUpdatedAt: 0,
  };
  paymentStore.set(alphaPayment);

  const service = new ExportService(
    exportStore,
    { PAYMENTS: paymentStore as unknown as TenantStore<{ id: string; tenantId: string }> },
    clock,
    ids
  );

  const adminActor: ActorContext = {
    tenantId: "tenant-alpha",
    userId: "user-admin",
    roles: ["ADMIN"],
  };
  const billingActor: ActorContext = {
    tenantId: "tenant-alpha",
    userId: "user-billing",
    roles: ["BILLING"],
  };
  const memberActor: ActorContext = {
    tenantId: "tenant-alpha",
    userId: "user-member",
    roles: ["MEMBER"],
  };
  const betaAdmin: ActorContext = {
    tenantId: "tenant-beta",
    userId: "user-beta-admin",
    roles: ["ADMIN"],
  };

  return { clock, ids, exportStore, paymentStore, service, adminActor, billingActor, memberActor, betaAdmin };
}

describe("ExportService.enqueueExport()", () => {
  it("ADMIN can enqueue an export", () => {
    const { service, adminActor } = setup();
    const r = service.enqueueExport(adminActor, "PAYMENTS");
    assert.ok(r.ok);
    assert.equal(r.value.status, "QUEUED");
    assert.equal(r.value.scope, "PAYMENTS");
  });

  it("BILLING can enqueue an export", () => {
    const { service, billingActor } = setup();
    const r = service.enqueueExport(billingActor, "PAYMENTS");
    assert.ok(r.ok);
  });

  it("MEMBER cannot enqueue an export", () => {
    const { service, memberActor } = setup();
    const r = service.enqueueExport(memberActor, "PAYMENTS");
    assert.ok(!r.ok);
    assert.match(r.error, /authorization denied/);
  });
});

describe("ExportService.runExport()", () => {
  it("runs and completes a queued export with correct record count", () => {
    const { service, adminActor } = setup();
    const enqueue = service.enqueueExport(adminActor, "PAYMENTS");
    assert.ok(enqueue.ok);
    const r = service.runExport(adminActor, enqueue.value.id);
    assert.ok(r.ok);
    assert.equal(r.value.status, "COMPLETED");
    assert.equal(r.value.recordCount, 1); // one alpha payment seeded
  });

  it("scopes export to actor tenant — no cross-tenant records", () => {
    const { service, betaAdmin } = setup();
    const enqueue = service.enqueueExport(betaAdmin, "PAYMENTS");
    assert.ok(enqueue.ok);
    const r = service.runExport(betaAdmin, enqueue.value.id);
    assert.ok(r.ok);
    assert.equal(r.value.recordCount, 0); // beta has no payments
  });

  it("rejects running a non-QUEUED job", () => {
    const { service, adminActor } = setup();
    const enqueue = service.enqueueExport(adminActor, "PAYMENTS");
    assert.ok(enqueue.ok);
    service.runExport(adminActor, enqueue.value.id);
    const r = service.runExport(adminActor, enqueue.value.id); // second run
    assert.ok(!r.ok);
    assert.match(r.error, /not in QUEUED status/);
  });
});
