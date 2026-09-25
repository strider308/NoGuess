import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeRetainedUntil,
  isPurgeEligible,
} from "../../src/domain/retention.js";
import type { RetentionRecord } from "../../src/domain/retention.js";

const DAYS_90_MS = 90 * 86_400_000;

function makeRecord(overrides: Partial<RetentionRecord> = {}): RetentionRecord {
  return {
    id: "acc-1",
    resourceId: "acc-1",
    resourceType: "account",
    tenantId: "tenant-alpha",
    createdAt: 1_000_000,
    retainedUntil: 1_000_000 + DAYS_90_MS,
    ...overrides,
  };
}

describe("computeRetainedUntil()", () => {
  it("adds ttlDays * 86400000 to createdAt", () => {
    const result = computeRetainedUntil(0, { ttlDays: 90 });
    assert.equal(result, DAYS_90_MS);
  });

  it("returns createdAt for ttlDays = 0", () => {
    const result = computeRetainedUntil(5_000, { ttlDays: 0 });
    assert.equal(result, 5_000);
  });
});

describe("isPurgeEligible()", () => {
  it("returns false before retainedUntil", () => {
    const record = makeRecord();
    assert.ok(!isPurgeEligible(record, record.retainedUntil - 1));
  });

  it("returns true at exactly retainedUntil", () => {
    const record = makeRecord();
    assert.ok(isPurgeEligible(record, record.retainedUntil));
  });

  it("returns true after retainedUntil", () => {
    const record = makeRecord();
    assert.ok(isPurgeEligible(record, record.retainedUntil + 1));
  });
});
