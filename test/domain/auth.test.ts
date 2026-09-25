import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AuthSession } from "../../src/domain/auth.js";
import {
  isSessionValid,
  verifyTokenAgainstSession,
} from "../../src/domain/auth.js";

function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    id: "session-1",
    tenantId: "tenant-alpha",
    userId: "user-1",
    token: "token-abc",
    issuedAt: 1_000,
    expiresAt: 5_000,
    status: "ACTIVE",
    ...overrides,
  };
}

describe("isSessionValid()", () => {
  it("returns true for ACTIVE session before expiry", () => {
    const session = makeSession();
    assert.ok(isSessionValid(session, 2_000));
  });

  it("returns false when expired (nowMs >= expiresAt)", () => {
    const session = makeSession();
    assert.ok(!isSessionValid(session, 5_000));
    assert.ok(!isSessionValid(session, 6_000));
  });

  it("returns false for REVOKED session", () => {
    const session = makeSession({ status: "REVOKED" });
    assert.ok(!isSessionValid(session, 2_000));
  });
});

describe("verifyTokenAgainstSession()", () => {
  it("succeeds with correct token and valid session", () => {
    const session = makeSession();
    const r = verifyTokenAgainstSession("token-abc", session, 2_000);
    assert.ok(r.ok);
    assert.equal(r.value.userId, "user-1");
    assert.equal(r.value.tenantId, "tenant-alpha");
  });

  it("fails with wrong token", () => {
    const session = makeSession();
    const r = verifyTokenAgainstSession("token-wrong", session, 2_000);
    assert.ok(!r.ok);
    assert.match(r.error, /does not match/);
  });

  it("fails with expired session", () => {
    const session = makeSession();
    const r = verifyTokenAgainstSession("token-abc", session, 9_000);
    assert.ok(!r.ok);
    assert.match(r.error, /expired/);
  });

  it("fails with revoked session", () => {
    const session = makeSession({ status: "REVOKED" });
    const r = verifyTokenAgainstSession("token-abc", session, 2_000);
    assert.ok(!r.ok);
    assert.match(r.error, /revoked/);
  });
});
