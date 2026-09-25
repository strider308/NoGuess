/**
 * ExportService — tenant-scoped data export.
 *
 * Invariants enforced:
 * - Only ADMIN or BILLING roles may enqueue an export.
 * - Export results are scoped to the requesting tenant.
 * - Cross-tenant data must never appear in results.
 */
import type { ClockPort } from "../lib/clock.js";
import type { IdFactory } from "../lib/ids.js";
import type { Result } from "../lib/result.js";
import { err, ok } from "../lib/result.js";
import type { ExportJob, ExportScope } from "../domain/export.js";
import { EXPORT_ALLOWED_ROLES } from "../domain/export.js";
import { assertAuthorized } from "../domain/tenant.js";
import type { ActorContext } from "../domain/tenant.js";
import { TenantStore } from "../infrastructure/store.js";
import type { TenantScoped } from "../infrastructure/store.js";

export class ExportService {
  constructor(
    private readonly exportStore: TenantStore<ExportJob>,
    /**
     * Registry of data stores to export from, keyed by ExportScope.
     * Each store must implement listByTenant(tenantId).
     * This keeps ExportService decoupled from specific domain stores.
     */
    private readonly dataStores: Partial<
      Record<ExportScope, TenantStore<TenantScoped>>
    >,
    private readonly clock: ClockPort,
    private readonly ids: IdFactory
  ) {}

  // -------------------------------------------------------------------------
  // Enqueue
  // -------------------------------------------------------------------------

  /**
   * Enqueue an export job. Only ADMIN or BILLING may do this.
   * The job is not run immediately; call runExport() to execute it.
   */
  enqueueExport(
    actor: ActorContext,
    scope: ExportScope
  ): Result<ExportJob, string> {
    const authCheck = assertAuthorized(actor.tenantId, actor, EXPORT_ALLOWED_ROLES);
    if (!authCheck.ok) return authCheck;

    const job: ExportJob = {
      id: this.ids.next("export"),
      tenantId: actor.tenantId,
      requestedBy: actor.userId,
      scope,
      status: "QUEUED",
      createdAt: this.clock.now(),
    };
    this.exportStore.set(job);
    return ok(job);
  }

  // -------------------------------------------------------------------------
  // Run
  // -------------------------------------------------------------------------

  /**
   * Execute a queued export job.
   * Scopes the result to the job's tenantId — never includes cross-tenant data.
   */
  runExport(
    actor: ActorContext,
    jobId: string
  ): Result<ExportJob, string> {
    const job = this.exportStore.get(jobId);
    if (!job) return err(`export job ${jobId} not found`);

    const authCheck = assertAuthorized(job.tenantId, actor, EXPORT_ALLOWED_ROLES);
    if (!authCheck.ok) return authCheck;

    if (job.status !== "QUEUED") {
      return err(`export job ${jobId} is not in QUEUED status (got ${job.status})`);
    }

    job.status = "RUNNING";
    this.exportStore.set(job);

    const store = this.dataStores[job.scope];
    let recordCount = 0;

    if (store) {
      // Scope strictly to the job's tenantId.
      const records = store.listByTenant(job.tenantId);
      recordCount = records.length;
    }

    job.status = "COMPLETED";
    job.recordCount = recordCount;
    job.resultRef = `export-result:${job.tenantId}:${job.scope}:${recordCount}`;
    job.completedAt = this.clock.now();
    this.exportStore.set(job);
    return ok(job);
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  getExportJob(actor: ActorContext, jobId: string): Result<ExportJob, string> {
    const job = this.exportStore.get(jobId);
    if (!job) return err(`export job ${jobId} not found`);
    const authCheck = assertAuthorized(job.tenantId, actor, EXPORT_ALLOWED_ROLES);
    if (!authCheck.ok) return authCheck;
    return ok(job);
  }

  listExportJobs(actor: ActorContext): ExportJob[] {
    return this.exportStore.listByTenant(actor.tenantId);
  }
}
