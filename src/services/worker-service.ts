/**
 * WorkerService — background job queue and execution.
 *
 * Invariants enforced:
 * - Tenant isolation on enqueue and result access.
 * - State machine: PENDING → RUNNING → DONE | FAILED.
 * - DONE or FAILED jobs are terminal; they cannot be re-run.
 *
 * Job handlers are registered by type and run synchronously in this
 * fixture (no threads, no timers — deterministic by design).
 */
import type { ClockPort } from "../lib/clock.js";
import type { IdFactory } from "../lib/ids.js";
import type { Result } from "../lib/result.js";
import { err, ok } from "../lib/result.js";
import type { BackgroundJob } from "../domain/worker.js";
import { isRunnable, validateJobTransition } from "../domain/worker.js";
import { assertTenantOwns } from "../domain/tenant.js";
import type { ActorContext } from "../domain/tenant.js";
import { TenantStore } from "../infrastructure/store.js";

/**
 * A job handler: receives the job payload and returns a result summary string,
 * or throws to indicate failure.
 */
export type JobHandler = (
  payload: Record<string, unknown>
) => string;

export class WorkerService {
  /** Registered handlers keyed by jobType. */
  private readonly handlers = new Map<string, JobHandler>();

  constructor(
    private readonly jobStore: TenantStore<BackgroundJob>,
    private readonly clock: ClockPort,
    private readonly ids: IdFactory
  ) {}

  // -------------------------------------------------------------------------
  // Handler registration
  // -------------------------------------------------------------------------

  /** Register a handler for a specific job type. */
  registerHandler(jobType: string, handler: JobHandler): void {
    this.handlers.set(jobType, handler);
  }

  // -------------------------------------------------------------------------
  // Enqueue
  // -------------------------------------------------------------------------

  enqueueJob(
    actor: ActorContext,
    jobType: string,
    payload: Record<string, unknown>
  ): Result<BackgroundJob, string> {
    const job: BackgroundJob = {
      id: this.ids.next("job"),
      tenantId: actor.tenantId,
      jobType,
      payload,
      status: "PENDING",
      createdAt: this.clock.now(),
    };
    this.jobStore.set(job);
    return ok(job);
  }

  // -------------------------------------------------------------------------
  // Run
  // -------------------------------------------------------------------------

  /**
   * Run all PENDING jobs across all tenants.
   * Returns an array of results: { jobId, success }.
   * Deterministic: jobs run in insertion order.
   */
  runPendingJobs(): Array<{ jobId: string; success: boolean; summary?: string; error?: string }> {
    const pending = this.jobStore.list().filter(isRunnable);
    const results: Array<{ jobId: string; success: boolean; summary?: string; error?: string }> = [];

    for (const job of pending) {
      const startCheck = validateJobTransition(job.status, "RUNNING");
      if (!startCheck.ok) {
        results.push({ jobId: job.id, success: false, error: startCheck.error });
        continue;
      }

      const now = this.clock.now();
      job.status = "RUNNING";
      job.startedAt = now;
      this.jobStore.set(job);

      const handler = this.handlers.get(job.jobType);
      if (!handler) {
        job.status = "FAILED";
        job.resultSummary = `no handler registered for job type "${job.jobType}"`;
        job.finishedAt = this.clock.now();
        this.jobStore.set(job);
        results.push({ jobId: job.id, success: false, error: job.resultSummary });
        continue;
      }

      try {
        const summary = handler(job.payload);
        job.status = "DONE";
        job.resultSummary = summary;
        job.finishedAt = this.clock.now();
        this.jobStore.set(job);
        results.push({ jobId: job.id, success: true, summary });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        job.status = "FAILED";
        job.resultSummary = msg;
        job.finishedAt = this.clock.now();
        this.jobStore.set(job);
        results.push({ jobId: job.id, success: false, error: msg });
      }
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  getJob(actor: ActorContext, jobId: string): Result<BackgroundJob, string> {
    const job = this.jobStore.get(jobId);
    if (!job) return err(`job ${jobId} not found`);
    const ownerCheck = assertTenantOwns(job.tenantId, actor);
    if (!ownerCheck.ok) return ownerCheck;
    return ok(job);
  }

  listJobs(actor: ActorContext): BackgroundJob[] {
    return this.jobStore.listByTenant(actor.tenantId);
  }
}
