import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BackgroundJob, JobStatus } from "../../src/domain/worker.js";
import { validateJobTransition, isRunnable } from "../../src/domain/worker.js";

function makeJob(status: JobStatus): BackgroundJob {
  return {
    id: "job-1",
    tenantId: "tenant-alpha",
    jobType: "test-job",
    payload: {},
    status,
    createdAt: 0,
  };
}

describe("validateJobTransition()", () => {
  const valid: Array<[JobStatus, JobStatus]> = [
    ["PENDING", "RUNNING"],
    ["RUNNING", "DONE"],
    ["RUNNING", "FAILED"],
  ];

  for (const [from, to] of valid) {
    it(`allows ${from} → ${to}`, () => {
      assert.ok(validateJobTransition(from, to).ok);
    });
  }

  const invalid: Array<[JobStatus, JobStatus]> = [
    ["PENDING", "DONE"],
    ["PENDING", "FAILED"],
    ["DONE", "PENDING"],
    ["DONE", "RUNNING"],
    ["DONE", "FAILED"],
    ["FAILED", "PENDING"],
    ["FAILED", "RUNNING"],
    ["FAILED", "DONE"],
  ];

  for (const [from, to] of invalid) {
    it(`rejects ${from} → ${to}`, () => {
      const r = validateJobTransition(from, to);
      assert.ok(!r.ok);
      assert.match(r.error, /invalid job transition/);
    });
  }
});

describe("isRunnable()", () => {
  it("returns true for PENDING", () => {
    assert.ok(isRunnable(makeJob("PENDING")));
  });

  for (const s of ["RUNNING", "DONE", "FAILED"] as JobStatus[]) {
    it(`returns false for ${s}`, () => {
      assert.ok(!isRunnable(makeJob(s)));
    });
  }
});
