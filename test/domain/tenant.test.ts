import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertTenantOwns,
  assertHasRole,
  assertAuthorized,
} from "../../src/domain/tenant.js";
import type { ActorContext } from "../../src/domain/tenant.js";

const alpha: ActorContext = {
  tenantId: "tenant-alpha",
  userId: "user-1",
  roles: ["ADMIN"],
};

const beta: ActorContext = {
  tenantId: "tenant-beta",
  userId: "user-2",
  roles: ["MEMBER"],
};

describe("assertTenantOwns()", () => {
  it("passes when tenantId matches actor", () => {
    const r = assertTenantOwns("tenant-alpha", alpha);
    assert.ok(r.ok);
  });

  it("fails when tenantId does not match actor", () => {
    const r = assertTenantOwns("tenant-alpha", beta);
    assert.ok(!r.ok);
    assert.match(r.error, /isolation violation/);
  });
});

describe("assertHasRole()", () => {
  it("passes when actor holds a required role", () => {
    const r = assertHasRole(alpha, ["ADMIN", "BILLING"]);
    assert.ok(r.ok);
  });

  it("fails when actor does not hold any required role", () => {
    const r = assertHasRole(beta, ["ADMIN", "BILLING"]);
    assert.ok(!r.ok);
    assert.match(r.error, /authorization denied/);
  });

  it("passes for MEMBER role when MEMBER is required", () => {
    const r = assertHasRole(beta, ["MEMBER"]);
    assert.ok(r.ok);
  });
});

describe("assertAuthorized()", () => {
  it("passes when both tenant and role match", () => {
    const r = assertAuthorized("tenant-alpha", alpha, ["ADMIN"]);
    assert.ok(r.ok);
  });

  it("fails on tenant mismatch even if role would match", () => {
    // alpha is ADMIN but wrong tenant
    const r = assertAuthorized("tenant-beta", alpha, ["ADMIN"]);
    assert.ok(!r.ok);
    assert.match(r.error, /isolation violation/);
  });

  it("fails on role mismatch even if tenant matches", () => {
    const member: ActorContext = {
      tenantId: "tenant-alpha",
      userId: "user-3",
      roles: ["MEMBER"],
    };
    const r = assertAuthorized("tenant-alpha", member, ["ADMIN"]);
    assert.ok(!r.ok);
    assert.match(r.error, /authorization denied/);
  });
});
