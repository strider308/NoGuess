import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FakeClock } from "../../src/lib/clock.js";
import { IdFactory } from "../../src/lib/ids.js";
import { TenantStore } from "../../src/infrastructure/store.js";
import type { Account } from "../../src/domain/account.js";
import type { RetentionRecord } from "../../src/domain/retention.js";
import { AccountService } from "../../src/services/account-service.js";
import { DEFAULT_POLICY } from "../../src/services/policy.js";
import type { ActorContext } from "../../src/domain/tenant.js";

function setup() {
  const clock = new FakeClock(0);
  const ids = new IdFactory();
  const accountStore = new TenantStore<Account>();
  const service = new AccountService(accountStore, clock, ids, DEFAULT_POLICY);

  const adminActor: ActorContext = {
    tenantId: "tenant-alpha",
    userId: "user-admin",
    roles: ["ADMIN"],
  };
  const managerActor: ActorContext = {
    tenantId: "tenant-alpha",
    userId: "user-manager",
    roles: ["MANAGER"],
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

  return { clock, ids, accountStore, service, adminActor, managerActor, memberActor, betaAdmin };
}

describe("AccountService.createAccount()", () => {
  it("creates an ACTIVE account for ADMIN", () => {
    const { service, adminActor } = setup();
    const r = service.createAccount(adminActor, "My Account");
    assert.ok(r.ok);
    assert.equal(r.value.status, "ACTIVE");
    assert.equal(r.value.tenantId, "tenant-alpha");
  });

  it("creates an account for MANAGER", () => {
    const { service, managerActor } = setup();
    const r = service.createAccount(managerActor, "Manager Account");
    assert.ok(r.ok);
  });

  it("rejects creation by MEMBER", () => {
    const { service, memberActor } = setup();
    const r = service.createAccount(memberActor, "Fail");
    assert.ok(!r.ok);
    assert.match(r.error, /authorization denied/);
  });
});

describe("AccountService lifecycle transitions", () => {
  it("ACTIVE → SUSPENDED → ACTIVE", () => {
    const { service, adminActor } = setup();
    const created = service.createAccount(adminActor, "Acc");
    assert.ok(created.ok);
    const id = created.value.id;

    const suspended = service.suspend(adminActor, id);
    assert.ok(suspended.ok);
    assert.equal(suspended.value.status, "SUSPENDED");

    const reactivated = service.reactivate(adminActor, id);
    assert.ok(reactivated.ok);
    assert.equal(reactivated.value.status, "ACTIVE");
  });

  it("ACTIVE → DEACTIVATED sets deactivatedAt", () => {
    const { service, adminActor, clock } = setup();
    clock.setNow(9_999);
    const created = service.createAccount(adminActor, "Acc");
    assert.ok(created.ok);
    clock.setNow(10_000);
    const r = service.deactivate(adminActor, created.value.id);
    assert.ok(r.ok);
    assert.equal(r.value.status, "DEACTIVATED");
    assert.equal(r.value.deactivatedAt, 10_000);
  });

  it("rejects ACTIVE → PURGED (must deactivate first)", () => {
    const { service, adminActor } = setup();
    const created = service.createAccount(adminActor, "Acc");
    assert.ok(created.ok);
    const r = service.purge(adminActor, created.value.id);
    assert.ok(!r.ok);
    assert.match(r.error, /must be DEACTIVATED first/);
  });
});

describe("AccountService.purge()", () => {
  it("purges a DEACTIVATED account after retention period elapses", () => {
    const { service, adminActor, clock } = setup();
    const created = service.createAccount(adminActor, "Acc");
    assert.ok(created.ok);

    service.deactivate(adminActor, created.value.id);

    // Advance past the 90-day retention TTL
    clock.advanceDays(DEFAULT_POLICY.retentionTtlDays + 1);

    const r = service.purge(adminActor, created.value.id);
    assert.ok(r.ok);
    assert.equal(r.value.status, "PURGED");
    assert.ok(r.value.purgedAt !== undefined);
  });

  it("rejects purge before retention period elapses", () => {
    const { service, adminActor } = setup();
    const created = service.createAccount(adminActor, "Acc");
    assert.ok(created.ok);
    service.deactivate(adminActor, created.value.id);
    // Clock not advanced — retention has not elapsed
    const r = service.purge(adminActor, created.value.id);
    assert.ok(!r.ok);
    assert.match(r.error, /not yet purge-eligible/);
  });

  it("rejects purge by non-ADMIN", () => {
    const { service, adminActor, managerActor, clock } = setup();
    const created = service.createAccount(adminActor, "Acc");
    assert.ok(created.ok);
    service.deactivate(adminActor, created.value.id);
    clock.advanceDays(DEFAULT_POLICY.retentionTtlDays + 1);
    const r = service.purge(managerActor, created.value.id);
    assert.ok(!r.ok);
    assert.match(r.error, /authorization denied/);
  });
});

describe("AccountService tenant isolation", () => {
  it("beta admin cannot get alpha account", () => {
    const { service, adminActor, betaAdmin } = setup();
    const created = service.createAccount(adminActor, "Alpha Acc");
    assert.ok(created.ok);
    const r = service.getAccount(betaAdmin, created.value.id);
    assert.ok(!r.ok);
    assert.match(r.error, /isolation violation/);
  });

  it("listAccounts returns only the actor's tenant accounts", () => {
    const { service, adminActor, betaAdmin } = setup();
    service.createAccount(adminActor, "Alpha 1");
    service.createAccount(adminActor, "Alpha 2");

    const alphaList = service.listAccounts(adminActor);
    assert.equal(alphaList.length, 2);
    assert.ok(alphaList.every((a) => a.tenantId === "tenant-alpha"));

    const betaList = service.listAccounts(betaAdmin);
    assert.equal(betaList.length, 0);
  });
});
