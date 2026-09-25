import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FakeClock } from "../../src/lib/clock.js";
import { IdFactory } from "../../src/lib/ids.js";
import { TenantStore } from "../../src/infrastructure/store.js";
import type { RetentionRecord } from "../../src/domain/retention.js";
import { RetentionService } from "../../src/services/retention-service.js";
import { DEFAULT_POLICY } from "../../src/services/policy.js";
import { computeRetainedUntil } from "../../src/domain/retention.js";
import type { ActorContext } from "../../src/domain/tenant.js";

function setup() {
  const clock = new FakeClock(0);
  const retentionStore = new TenantStore<RetentionRecord>();
  const service = new RetentionService(retentionStore, clock);

  const admin: ActorContext = {
    tenantId: "tenant-alpha",
    userId: "user-admin",
    roles: ["ADMIN"],
  };
  const member: ActorContext = {
    tenantId: "tenant-alpha",
    userId: "user-member",
    roles: ["MEMBER"],
  };

  function registerRecord(resourceId: string, createdAt: number) {
    const rec: RetentionRecord = {
      id: resourceId,
      resourceId,
      resourceType: "account",
      tenantId: "tenant-alpha",
      createdAt,
      retainedUntil: computeRetainedUntil(createdAt, {
        ttlDays: DEFAULT_POLICY.retentionTtlDays,
      }),
    };
    service.registerRecord(rec);
    return rec;
  }

  return { clock, service, admin, member, registerRecord };
}

describe("RetentionService.evaluateRetention()", () => {
  it("returns empty list when no records are eligible", () => {
    const { service, admin, registerRecord } = setup();
    registerRecord("acc-1", 0);
    const r = service.evaluateRetention(admin);
    assert.ok(r.ok);
    assert.equal(r.value.length, 0);
  });

  it("returns records after TTL has elapsed", () => {
    const { service, admin, registerRecord, clock } = setup();
    registerRecord("acc-1", 0);
    clock.advanceDays(DEFAULT_POLICY.retentionTtlDays + 1);
    const r = service.evaluateRetention(admin);
    assert.ok(r.ok);
    assert.equal(r.value.length, 1);
    assert.equal(r.value[0]?.resourceId, "acc-1");
  });

  it("MEMBER cannot evaluate retention", () => {
    const { service, member } = setup();
    const r = service.evaluateRetention(member);
    assert.ok(!r.ok);
    assert.match(r.error, /authorization denied/);
  });
});
