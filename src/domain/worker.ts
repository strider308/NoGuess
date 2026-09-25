/**
 * Worker domain model.
 *
 * Models background job queue entries and execution records.
 *
 * State machine:
 *   PENDING ──► RUNNING ──► DONE
 *                       └──► FAILED
 *
 * A DONE or FAILED job is terminal and must not be re-enqueued or re-run.
 */
import type { Result } from "../lib/result.js";
import { err, ok } from "../lib/result.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED";

export interface BackgroundJob {
  readonly id: string;
  readonly tenantId: string;
  /** Neutral job type label, e.g. "send-retention-report". */
  readonly jobType: string;
  /** Arbitrary serialisable input for the job handler. */
  readonly payload: Record<string, unknown>;
  status: JobStatus;
  /** Set when status → DONE or FAILED. */
  resultSummary?: string;
  readonly createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

// ---------------------------------------------------------------------------
// State machine guard
// ---------------------------------------------------------------------------

/**
 * Validate that a transition from `from` to `to` is permitted.
 */
export function validateJobTransition(
  from: JobStatus,
  to: JobStatus
): Result<void, string> {
  const VALID: Record<JobStatus, JobStatus[]> = {
    PENDING: ["RUNNING"],
    RUNNING: ["DONE", "FAILED"],
    DONE: [],
    FAILED: [],
  };
  if (!VALID[from].includes(to)) {
    return err(
      `invalid job transition: ${from} → ${to}. ` +
        `Allowed from ${from}: [${VALID[from].join(", ") || "none"}]`
    );
  }
  return ok(undefined);
}

/**
 * Return true if a job can be picked up and run.
 */
export function isRunnable(job: BackgroundJob): boolean {
  return job.status === "PENDING";
}
