/**
 * AccountService — account lifecycle management.
 *
 * Operations: createAccount, suspend, reactivate, deactivate, purge.
 *
 * Invariants enforced:
 * - Tenant isolation: actor must belong to the same tenant as the account.
 * - Role authorization: suspend/deactivate require ADMIN or MANAGER;
 *                       purge requires ADMIN only.
 * - Lifecycle transitions follow the table in domain/account.ts.
 * - Purge requires BOTH authorization AND retention eligibility.
 */
import type { ClockPort } from "../lib/clock.js";
import type { IdFactory } from "../lib/ids.js";
import type { Result } from "../lib/result.js";
import { err, ok } from "../lib/result.js";
import type { Account, CustomerTier } from "../domain/account.js";
import { isPurgeCandidate, validateTransition } from "../domain/account.js";
import { computeRetainedUntil, isPurgeEligible } from "../domain/retention.js";
import type { RetentionRecord } from "../domain/retention.js";
import { assertAuthorized, assertTenantOwns } from "../domain/tenant.js";
import type { ActorContext } from "../domain/tenant.js";
import { TenantStore } from "../infrastructure/store.js";
import type { PolicyConfig } from "./policy.js";

export class AccountService {
  private readonly retentionStore = new TenantStore<RetentionRecord>();

  constructor(
    private readonly accountStore: TenantStore<Account>,
    private readonly clock: ClockPort,
    private readonly ids: IdFactory,
    private readonly policy: PolicyConfig
  ) {}

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  createAccount(
    actor: ActorContext,
    name: string,
    tier: CustomerTier = "STANDARD"
  ): Result<Account, string> {
    const authCheck = assertAuthorized(actor.tenantId, actor, ["ADMIN", "MANAGER"]);
    if (!authCheck.ok) return authCheck;

    const now = this.clock.now();
    const account: Account = {
      id: this.ids.next("account"),
      tenantId: actor.tenantId,
      name,
      tier,
      status: "ACTIVE",
      createdAt: now,
    };
    this.accountStore.set(account);

    // Create retention record immediately.
    const retentionRecord: RetentionRecord = {
      id: account.id,
      resourceId: account.id,
      resourceType: "account",
      tenantId: actor.tenantId,
      createdAt: now,
      retainedUntil: computeRetainedUntil(now, {
        ttlDays: this.policy.retentionTtlDays,
      }),
    };
    this.retentionStore.set(retentionRecord);

    return ok(account);
  }

  // -------------------------------------------------------------------------
  // Suspend / Reactivate
  // -------------------------------------------------------------------------

  suspend(actor: ActorContext, accountId: string): Result<Account, string> {
    return this.transition(actor, accountId, "SUSPENDED", ["ADMIN", "MANAGER"]);
  }

  reactivate(actor: ActorContext, accountId: string): Result<Account, string> {
    return this.transition(actor, accountId, "ACTIVE", ["ADMIN", "MANAGER"]);
  }

  // -------------------------------------------------------------------------
  // Deactivate
  // -------------------------------------------------------------------------

  deactivate(actor: ActorContext, accountId: string): Result<Account, string> {
    const result = this.transition(actor, accountId, "DEACTIVATED", ["ADMIN", "MANAGER"]);
    if (result.ok) {
      result.value.deactivatedAt = this.clock.now();
      this.accountStore.set(result.value);
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Purge
  // -------------------------------------------------------------------------

  /**
   * Purge an account.
   *
   * Requires:
   * 1. Actor is ADMIN.
   * 2. Account is in DEACTIVATED status (isPurgeCandidate).
   * 3. Retention period has elapsed (isPurgeEligible).
   *
   * ADMIN role alone does NOT bypass retention policy.
   */
  purge(actor: ActorContext, accountId: string): Result<Account, string> {
    const account = this.accountStore.get(accountId);
    if (!account) {
      return err(`account ${accountId} not found`);
    }

    const ownerCheck = assertTenantOwns(account.tenantId, actor);
    if (!ownerCheck.ok) return ownerCheck;

    const roleCheck = assertAuthorized(account.tenantId, actor, ["ADMIN"]);
    if (!roleCheck.ok) return roleCheck;

    if (!isPurgeCandidate(account)) {
      return err(
        `account ${accountId} cannot be purged: must be DEACTIVATED first (current: ${account.status})`
      );
    }

    // Check retention eligibility.
    const retentionRecord = this.retentionStore.get(accountId);
    if (!retentionRecord) {
      return err(`account ${accountId} has no retention record; cannot purge`);
    }
    if (!isPurgeEligible(retentionRecord, this.clock.now())) {
      return err(
        `account ${accountId} is not yet purge-eligible: retention period ends at ` +
          `${retentionRecord.retainedUntil} (now: ${this.clock.now()})`
      );
    }

    const transitionCheck = validateTransition(account.status, "PURGED");
    if (!transitionCheck.ok) return transitionCheck;

    account.status = "PURGED";
    account.purgedAt = this.clock.now();
    this.accountStore.set(account);
    return ok(account);
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  getAccount(
    actor: ActorContext,
    accountId: string
  ): Result<Account, string> {
    const account = this.accountStore.get(accountId);
    if (!account) return err(`account ${accountId} not found`);
    const ownerCheck = assertTenantOwns(account.tenantId, actor);
    if (!ownerCheck.ok) return ownerCheck;
    return ok(account);
  }

  listAccounts(actor: ActorContext): Account[] {
    return this.accountStore.listByTenant(actor.tenantId);
  }

  getRetentionRecord(accountId: string): RetentionRecord | undefined {
    const r = this.retentionStore.get(accountId);
    return r;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private transition(
    actor: ActorContext,
    accountId: string,
    to: Account["status"],
    requiredRoles: ActorContext["roles"]
  ): Result<Account, string> {
    const account = this.accountStore.get(accountId);
    if (!account) return err(`account ${accountId} not found`);

    const authCheck = assertAuthorized(account.tenantId, actor, requiredRoles);
    if (!authCheck.ok) return authCheck;

    const transitionCheck = validateTransition(account.status, to);
    if (!transitionCheck.ok) return transitionCheck;

    account.status = to;
    this.accountStore.set(account);
    return ok(account);
  }
}
