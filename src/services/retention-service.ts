/**
 * RetentionService — evaluate and enforce data-retention policy.
 *
 * Operations:
 * - evaluateRetention: list resources whose retention period has elapsed.
 * - runPurge: purge all eligible resources of a given type.
 *
 * Retention records are created by other services at resource creation time.
 * This service reads them and drives purge decisions.
 */
import type { ClockPort } from "../lib/clock.js";
import type { Result } from "../lib/result.js";
import { ok } from "../lib/result.js";
import type { RetentionRecord } from "../domain/retention.js";
import { isPurgeEligible } from "../domain/retention.js";
import { assertAuthorized } from "../domain/tenant.js";
import type { ActorContext } from "../domain/tenant.js";
import { TenantStore } from "../infrastructure/store.js";

export class RetentionService {
  constructor(
    private readonly retentionStore: TenantStore<RetentionRecord>,
    private readonly clock: ClockPort
  ) {}

  // -------------------------------------------------------------------------
  // Evaluate
  // -------------------------------------------------------------------------

  /**
   * List all retention records for the actor's tenant where the retention
   * period has elapsed (i.e., purge is eligible from a time perspective).
   * Authorization is required (ADMIN only).
   */
  evaluateRetention(actor: ActorContext): Result<RetentionRecord[], string> {
    const authCheck = assertAuthorized(actor.tenantId, actor, ["ADMIN"]);
    if (!authCheck.ok) return authCheck;

    const now = this.clock.now();
    const eligible = this.retentionStore
      .listByTenant(actor.tenantId)
      .filter((r) => isPurgeEligible(r, now));

    return ok(eligible);
  }

  /**
   * List all retention records for the actor's tenant, regardless of
   * eligibility. Useful for inspection in tests.
   */
  listAll(actor: ActorContext): Result<RetentionRecord[], string> {
    const authCheck = assertAuthorized(actor.tenantId, actor, ["ADMIN"]);
    if (!authCheck.ok) return authCheck;
    return ok(this.retentionStore.listByTenant(actor.tenantId));
  }

  /**
   * Register a retention record (called by other services at creation time).
   * Not gated by actor — this is an internal service-to-service call.
   */
  registerRecord(record: RetentionRecord): void {
    this.retentionStore.set(record);
  }

  /**
   * Look up a retention record by resource ID.
   */
  getRecord(resourceId: string): RetentionRecord | undefined {
    return this.retentionStore.get(resourceId);
  }
}
