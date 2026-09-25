import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FakeClock } from "../../src/lib/clock.js";
import { IdFactory } from "../../src/lib/ids.js";
import { TenantStore } from "../../src/infrastructure/store.js";
import type { BackgroundJob } from "../../src/domain/worker.js";
import { WorkerService } from "../../src/services/worker-service.js";
import type { ActorContext } from "../../src/domain/tenant.js";

function setup() {
  const clock = new FakeClock(0);
  const ids = new IdFactory();
  const jobStore = new TenantStore<BackgroundJob>();
  const service = new WorkerService(jobStore, clock, ids);

  const alpha: ActorContext = {
    tenantId: "tenant-alpha",
    userId: "user-admin",
    roles: ["ADMIN"],
  };
  const beta: ActorContext = {
    tenantId: "tenant-beta",
    userId: "user-beta",
    roles: ["ADMIN"],
  };

  return { clock, ids, jobStore, service, alpha, beta };
}

describe("WorkerService.enqueueJob() + runPendingJobs()", () => {
  it("runs a PENDING job to DONE with a registered handler", () => {
    const { service, alpha } = setup();
    service.registerHandler("my-job", () => "done successfully");
    const enqueue = service.enqueueJob(alpha, "my-job", { key: "value" });
    assert.ok(enqueue.ok);
    assert.equal(enqueue.value.status, "PENDING");

    const results = service.runPendingJobs();
    assert.equal(results.length, 1);
    assert.ok(results[0]?.success);
    assert.equal(results[0]?.summary, "done successfully");

    const job = service.getJob(alpha, enqueue.value.id);
    assert.ok(job.ok);
    assert.equal(job.value.status, "DONE");
  });

  it("transitions to FAILED when handler throws", () => {
    const { service, alpha } = setup();
    service.registerHandler("bad-job", () => {
      throw new Error("handler exploded");
    });
    const enqueue = service.enqueueJob(alpha, "bad-job", {});
    assert.ok(enqueue.ok);

    const results = service.runPendingJobs();
    assert.ok(!results[0]?.success);
    assert.match(results[0]?.error ?? "", /handler exploded/);

    const job = service.getJob(alpha, enqueue.value.id);
    assert.ok(job.ok);
    assert.equal(job.value.status, "FAILED");
  });

  it("transitions to FAILED when no handler is registered", () => {
    const { service, alpha } = setup();
    const enqueue = service.enqueueJob(alpha, "unregistered-job", {});
    assert.ok(enqueue.ok);

    const results = service.runPendingJobs();
    assert.ok(!results[0]?.success);
    assert.match(results[0]?.error ?? "", /no handler registered/);
  });

  it("does not re-run DONE or FAILED jobs", () => {
    const { service, alpha } = setup();
    service.registerHandler("once", () => "ok");
    const enqueue = service.enqueueJob(alpha, "once", {});
    assert.ok(enqueue.ok);

    service.runPendingJobs(); // runs once → DONE
    const secondRun = service.runPendingJobs();
    assert.equal(secondRun.length, 0); // nothing pending
  });

  it("passes payload to handler", () => {
    const { service, alpha } = setup();
    let receivedPayload: Record<string, unknown> | undefined;
    service.registerHandler("capture", (p) => {
      receivedPayload = p;
      return "captured";
    });
    service.enqueueJob(alpha, "capture", { answer: 42 });
    service.runPendingJobs();
    assert.deepEqual(receivedPayload, { answer: 42 });
  });
});

describe("WorkerService tenant isolation", () => {
  it("beta actor cannot access alpha job", () => {
    const { service, alpha, beta } = setup();
    service.registerHandler("test", () => "ok");
    const enqueue = service.enqueueJob(alpha, "test", {});
    assert.ok(enqueue.ok);
    const r = service.getJob(beta, enqueue.value.id);
    assert.ok(!r.ok);
    assert.match(r.error, /isolation violation/);
  });
});
