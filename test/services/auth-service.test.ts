import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeClock } from "../../src/lib/clock.js";
import { IdFactory } from "../../src/lib/ids.js";
import { FakeKms } from "../../src/infrastructure/fake-kms.js";
import { TenantStore } from "../../src/infrastructure/store.js";
import type { User } from "../../src/domain/tenant.js";
import { AuthService } from "../../src/services/auth-service.js";
import { DEFAULT_POLICY } from "../../src/services/policy.js";

function setup() {
  const clock = new FakeClock(0);
  const ids = new IdFactory();
  const kms = new FakeKms();
  const userStore = new TenantStore<User>();
  const service = new AuthService(userStore, clock, ids, DEFAULT_POLICY, kms);

  const user: User = {
    id: "user-1",
    tenantId: "tenant-alpha",
    name: "Test User",
    email: "test@alpha.example",
    passwordHash: kms.encrypt("correct-password").ciphertext,
    roles: ["ADMIN"],
    createdAt: 0,
  };
  userStore.set(user);

  return { clock, ids, kms, userStore, service, user };
}

describe("AuthService.login()", () => {
  it("issues a session with correct credentials", () => {
    const { service } = setup();
    const r = service.login("tenant-alpha", "user-1", "correct-password");
    assert.ok(r.ok);
    assert.equal(r.value.tenantId, "tenant-alpha");
    assert.equal(r.value.userId, "user-1");
    assert.equal(r.value.status, "ACTIVE");
  });

  it("sets expiresAt based on sessionTtlSeconds", () => {
    const { service, clock } = setup();
    clock.setNow(1_000_000);
    const r = service.login("tenant-alpha", "user-1", "correct-password");
    assert.ok(r.ok);
    assert.equal(
      r.value.expiresAt,
      1_000_000 + DEFAULT_POLICY.sessionTtlSeconds * 1_000
    );
  });

  it("rejects wrong password", () => {
    const { service } = setup();
    const r = service.login("tenant-alpha", "user-1", "wrong-password");
    assert.ok(!r.ok);
    assert.match(r.error, /invalid credentials/);
  });

  it("rejects unknown user", () => {
    const { service } = setup();
    const r = service.login("tenant-alpha", "no-such-user", "any");
    assert.ok(!r.ok);
    assert.match(r.error, /not found/);
  });

  it("rejects user from wrong tenant", () => {
    const { service } = setup();
    const r = service.login("tenant-beta", "user-1", "correct-password");
    assert.ok(!r.ok);
    assert.match(r.error, /does not belong/);
  });
});

describe("AuthService.validateToken()", () => {
  it("validates a freshly issued token", () => {
    const { service } = setup();
    const login = service.login("tenant-alpha", "user-1", "correct-password");
    assert.ok(login.ok);
    const r = service.validateToken(login.value.token);
    assert.ok(r.ok);
    assert.equal(r.value.userId, "user-1");
  });

  it("rejects token after session expires", () => {
    const { service, clock } = setup();
    const login = service.login("tenant-alpha", "user-1", "correct-password");
    assert.ok(login.ok);
    // Advance past TTL
    clock.advanceSeconds(DEFAULT_POLICY.sessionTtlSeconds + 1);
    const r = service.validateToken(login.value.token);
    assert.ok(!r.ok);
    assert.match(r.error, /expired/);
  });

  it("rejects unknown token", () => {
    const { service } = setup();
    const r = service.validateToken("no-such-token");
    assert.ok(!r.ok);
  });
});

describe("AuthService.logout()", () => {
  it("revokes a session so the token is no longer valid", () => {
    const { service } = setup();
    const login = service.login("tenant-alpha", "user-1", "correct-password");
    assert.ok(login.ok);
    const logoutR = service.logout(login.value.token);
    assert.ok(logoutR.ok);
    const validateR = service.validateToken(login.value.token);
    assert.ok(!validateR.ok);
    assert.match(validateR.error, /revoked/);
  });

  it("fails to logout an unknown token", () => {
    const { service } = setup();
    const r = service.logout("ghost-token");
    assert.ok(!r.ok);
  });
});
