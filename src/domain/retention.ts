/**
 * Retention domain model.
 *
 * Models data-retention policy and purge eligibility.
 *
 * A resource is NOT purge-eligible until its retainedUntil timestamp
 * (computed from policy TTL + creation time via FakeClock) has elapsed.
 *
 * This prevents ADMIN role alone from bypassing retention policy.
 * Both authorization AND retention eligibility must pass before a purge.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * RetentionPolicy — the configured retention rules for a tenant or resource.
 * TTL is in whole days; the service converts to milliseconds using the clock.
 */
export interface RetentionPolicy {
  readonly ttlDays: number; // minimum days a resource must be retained
}

/**
 * RetentionRecord — tracks the retention status of a specific resource.
 * The `id` field equals `resourceId` so it can be stored in a TenantStore.
 */
export interface RetentionRecord {
  readonly id: string;           // equals resourceId; required by TenantStore
  readonly resourceId: string;
  readonly resourceType: string; // e.g. "account", "payment"
  readonly tenantId: string;
  readonly createdAt: number;    // Unix ms (from FakeClock at creation time)
  readonly retainedUntil: number; // Unix ms; purge not allowed before this
}

// ---------------------------------------------------------------------------
// Policy computation
// ---------------------------------------------------------------------------

/**
 * Compute the retainedUntil timestamp for a resource.
 *
 * @param createdAt   Unix ms when the resource was created (FakeClock).
 * @param policy      The applicable retention policy.
 */
export function computeRetainedUntil(
  createdAt: number,
  policy: RetentionPolicy
): number {
  return createdAt + policy.ttlDays * 86_400_000;
}

// ---------------------------------------------------------------------------
// Purge eligibility predicate
// ---------------------------------------------------------------------------

/**
 * Return whether a resource may be purged at the given clock time.
 *
 * @param record  The retention record for the resource.
 * @param nowMs   Current time from FakeClock.
 */
export function isPurgeEligible(
  record: RetentionRecord,
  nowMs: number
): boolean {
  return nowMs >= record.retainedUntil;
}
