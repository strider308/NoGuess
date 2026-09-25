import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Account, AccountStatus } from "../../src/domain/account.js";
import {
  validateTransition,
  isPurgeCandidate,
} from "../../src/domain/account.js";

describe("validateTransition()", () => {
  const valid: Array<[AccountStatus, AccountStatus]> = [
    ["ACTIVE", "SUSPENDED"],
    ["ACTIVE", "DEACTIVATED"],
    ["SUSPENDED", "ACTIVE"],
    ["DEACTIVATED", "PURGED"],
  ];

  for (const [from, to] of valid) {
    it(`allows ${from} → ${to}`, () => {
      assert.ok(validateTransition(from, to).ok);
    });
  }

  const invalid: Array<[AccountStatus, AccountStatus]> = [
    ["ACTIVE", "PURGED"],
    ["SUSPENDED", "DEACTIVATED"],
    ["SUSPENDED", "PURGED"],
    ["PURGED", "ACTIVE"],
    ["PURGED", "DEACTIVATED"],
    ["DEACTIVATED", "ACTIVE"],
    ["DEACTIVATED", "SUSPENDED"],
  ];

  for (const [from, to] of invalid) {
    it(`rejects ${from} → ${to}`, () => {
      const r = validateTransition(from, to);
      assert.ok(!r.ok);
      assert.match(r.error, /invalid account transition/);
    });
  }
});

describe("isPurgeCandidate()", () => {
  function makeAccount(status: AccountStatus): Account {
    return {
      id: "acc-1",
      tenantId: "t-1",
      name: "Test",
      tier: "STANDARD",
      status,
      createdAt: 0,
    };
  }

  it("returns true for DEACTIVATED", () => {
    assert.ok(isPurgeCandidate(makeAccount("DEACTIVATED")));
  });

  for (const s of ["ACTIVE", "SUSPENDED", "PURGED"] as AccountStatus[]) {
    it(`returns false for ${s}`, () => {
      assert.ok(!isPurgeCandidate(makeAccount(s)));
    });
  }
});
