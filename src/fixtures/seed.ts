/**
 * Deterministic seed fixture for NoGuess M0.
 *
 * Produces a fully specified, reproducible fixture state:
 *
 * Tenants:
 *   tenant-alpha  (primary tenant; used in most tests)
 *   tenant-beta   (secondary tenant; used for isolation tests)
 *
 * Users (tenant-alpha):
 *   user-alpha-admin   — ADMIN
 *   user-alpha-billing — BILLING
 *   user-alpha-member  — MEMBER
 *
 * Users (tenant-beta):
 *   user-beta-admin  — ADMIN
 *   user-beta-member — MEMBER
 *
 * Accounts:
 *   account-alpha-1  (tenant-alpha, ACTIVE)
 *   account-alpha-2  (tenant-alpha, SUSPENDED)
 *   account-beta-1   (tenant-beta, ACTIVE)
 *   account-beta-2   (tenant-beta, ACTIVE)
 *
 * Payments (tenant-alpha):
 *   pay-alpha-1  SUCCEEDED  (scripted outcome: SUCCESS)
 *   pay-alpha-2  FAILED/TRANSIENT  (scripted outcome: TRANSIENT_FAILURE)
 *   pay-alpha-3  FAILED/HARD_DECLINE  (scripted outcome: HARD_DECLINE)
 *
 * Payments (tenant-beta):
 *   pay-beta-1   SUCCEEDED
 *   pay-beta-2   FAILED/TRANSIENT
 *   pay-beta-3   FAILED/HARD_DECLINE
 *
 * Webhook subscriptions:
 *   webhook-alpha-1  tenant-alpha  eventType: "order.completed"
 *   webhook-alpha-2  tenant-alpha  eventType: "payment.failed"
 *   webhook-beta-1   tenant-beta   eventType: "order.completed"
 *
 * Worker jobs:
 *   job-alpha-1  tenant-alpha  PENDING  jobType: "send-retention-report"
 *   job-beta-1   tenant-beta   PENDING  jobType: "send-retention-report"
 *
 * All IDs are stable fixed strings (not generated via IdFactory at seed time)
 * so tests can reference them directly without knowing IdFactory state.
 *
 * Passwords are fake-KMS-encoded. Plaintext is "<userId>-password".
 * e.g. user-alpha-admin's password is "user-alpha-admin-password".
 */
import type { Tenant, User } from "../domain/tenant.js";
import type { Account } from "../domain/account.js";
import type { Payment } from "../domain/payment.js";
import type { WebhookSubscription } from "../domain/webhook.js";
import type { BackgroundJob } from "../domain/worker.js";
import type { RetentionRecord } from "../domain/retention.js";
import { computeRetainedUntil } from "../domain/retention.js";
import { money } from "../lib/money.js";
import { FakeKms } from "../infrastructure/fake-kms.js";
import type { InMemoryStore, TenantStore } from "../infrastructure/store.js";
import type { FakePaymentProcessor } from "../infrastructure/fake-payment-processor.js";
import type { PolicyConfig } from "../services/policy.js";

// ---------------------------------------------------------------------------
// Fixed seed timestamp — all fixture records use this as createdAt.
// This matches the FakeClock default start: 1_700_000_000_000
// ---------------------------------------------------------------------------
export const SEED_EPOCH_MS = 1_700_000_000_000;

// ---------------------------------------------------------------------------
// Fixed IDs — stable references for tests
// ---------------------------------------------------------------------------
export const SEED_IDS = {
  // Tenants
  TENANT_ALPHA: "tenant-alpha",
  TENANT_BETA: "tenant-beta",

  // Users — alpha
  USER_ALPHA_ADMIN: "user-alpha-admin",
  USER_ALPHA_BILLING: "user-alpha-billing",
  USER_ALPHA_MEMBER: "user-alpha-member",

  // Users — beta
  USER_BETA_ADMIN: "user-beta-admin",
  USER_BETA_MEMBER: "user-beta-member",

  // Accounts
  ACCOUNT_ALPHA_1: "account-alpha-1",
  ACCOUNT_ALPHA_2: "account-alpha-2",
  ACCOUNT_BETA_1: "account-beta-1",
  ACCOUNT_BETA_2: "account-beta-2",

  // Payments
  PAY_ALPHA_1: "pay-alpha-1",
  PAY_ALPHA_2: "pay-alpha-2",
  PAY_ALPHA_3: "pay-alpha-3",
  PAY_BETA_1: "pay-beta-1",
  PAY_BETA_2: "pay-beta-2",
  PAY_BETA_3: "pay-beta-3",

  // Webhooks
  WEBHOOK_ALPHA_1: "webhook-alpha-1",
  WEBHOOK_ALPHA_2: "webhook-alpha-2",
  WEBHOOK_BETA_1: "webhook-beta-1",

  // Worker jobs
  JOB_ALPHA_1: "job-alpha-1",
  JOB_BETA_1: "job-beta-1",
} as const;

// Idempotency keys for payments (used to key scripted processor outcomes)
export const SEED_IDEM_KEYS = {
  PAY_ALPHA_1: "idem-pay-alpha-1",
  PAY_ALPHA_2: "idem-pay-alpha-2",
  PAY_ALPHA_3: "idem-pay-alpha-3",
  PAY_BETA_1: "idem-pay-beta-1",
  PAY_BETA_2: "idem-pay-beta-2",
  PAY_BETA_3: "idem-pay-beta-3",
} as const;

// ---------------------------------------------------------------------------
// Seed stores
// ---------------------------------------------------------------------------

export interface SeedStores {
  tenants: InMemoryStore<Tenant>;
  users: TenantStore<User>;
  accounts: TenantStore<Account>;
  payments: TenantStore<Payment>;
  webhooks: TenantStore<WebhookSubscription>;
  jobs: TenantStore<BackgroundJob>;
  retention: TenantStore<RetentionRecord>;
}

/**
 * Populate all provided stores with the deterministic seed fixture.
 * Also scripts the FakePaymentProcessor with the seeded payment outcomes.
 *
 * This function is idempotent if stores are cleared before calling.
 */
export function seedFixture(
  stores: SeedStores,
  processor: FakePaymentProcessor,
  policy: PolicyConfig
): void {
  const kms = new FakeKms();
  const now = SEED_EPOCH_MS;

  // ----- Tenants -----------------------------------------------------------
  const tenants: Tenant[] = [
    { id: SEED_IDS.TENANT_ALPHA, name: "Alpha Corp", createdAt: now },
    { id: SEED_IDS.TENANT_BETA, name: "Beta Inc", createdAt: now },
  ];
  for (const t of tenants) stores.tenants.set(t);

  // ----- Users -------------------------------------------------------------
  const users: User[] = [
    {
      id: SEED_IDS.USER_ALPHA_ADMIN,
      tenantId: SEED_IDS.TENANT_ALPHA,
      name: "Alpha Admin",
      email: "admin@alpha.example",
      passwordHash: kms.encrypt(`${SEED_IDS.USER_ALPHA_ADMIN}-password`).ciphertext,
      roles: ["ADMIN"],
      createdAt: now,
    },
    {
      id: SEED_IDS.USER_ALPHA_BILLING,
      tenantId: SEED_IDS.TENANT_ALPHA,
      name: "Alpha Billing",
      email: "billing@alpha.example",
      passwordHash: kms.encrypt(`${SEED_IDS.USER_ALPHA_BILLING}-password`).ciphertext,
      roles: ["BILLING"],
      createdAt: now,
    },
    {
      id: SEED_IDS.USER_ALPHA_MEMBER,
      tenantId: SEED_IDS.TENANT_ALPHA,
      name: "Alpha Member",
      email: "member@alpha.example",
      passwordHash: kms.encrypt(`${SEED_IDS.USER_ALPHA_MEMBER}-password`).ciphertext,
      roles: ["MEMBER"],
      createdAt: now,
    },
    {
      id: SEED_IDS.USER_BETA_ADMIN,
      tenantId: SEED_IDS.TENANT_BETA,
      name: "Beta Admin",
      email: "admin@beta.example",
      passwordHash: kms.encrypt(`${SEED_IDS.USER_BETA_ADMIN}-password`).ciphertext,
      roles: ["ADMIN"],
      createdAt: now,
    },
    {
      id: SEED_IDS.USER_BETA_MEMBER,
      tenantId: SEED_IDS.TENANT_BETA,
      name: "Beta Member",
      email: "member@beta.example",
      passwordHash: kms.encrypt(`${SEED_IDS.USER_BETA_MEMBER}-password`).ciphertext,
      roles: ["MEMBER"],
      createdAt: now,
    },
  ];
  for (const u of users) stores.users.set(u);

  // ----- Accounts ----------------------------------------------------------
  const retainedUntil = computeRetainedUntil(now, {
    ttlDays: policy.retentionTtlDays,
  });

  const accounts: Account[] = [
    {
      id: SEED_IDS.ACCOUNT_ALPHA_1,
      tenantId: SEED_IDS.TENANT_ALPHA,
      name: "Alpha Primary Account",
      tier: "VIP",       // neutral business data — no policy effect
      status: "ACTIVE",
      createdAt: now,
    },
    {
      id: SEED_IDS.ACCOUNT_ALPHA_2,
      tenantId: SEED_IDS.TENANT_ALPHA,
      name: "Alpha Secondary Account",
      tier: "STANDARD",
      status: "SUSPENDED",
      createdAt: now,
    },
    {
      id: SEED_IDS.ACCOUNT_BETA_1,
      tenantId: SEED_IDS.TENANT_BETA,
      name: "Beta Primary Account",
      tier: "STANDARD",
      status: "ACTIVE",
      createdAt: now,
    },
    {
      id: SEED_IDS.ACCOUNT_BETA_2,
      tenantId: SEED_IDS.TENANT_BETA,
      name: "Beta Secondary Account",
      tier: "STANDARD",
      status: "ACTIVE",
      createdAt: now,
    },
  ];
  for (const a of accounts) stores.accounts.set(a);

  // Retention records for accounts
  for (const a of accounts) {
    const rec: RetentionRecord = {
      id: a.id,
      resourceId: a.id,
      resourceType: "account",
      tenantId: a.tenantId,
      createdAt: now,
      retainedUntil,
    };
    stores.retention.set(rec);
  }

  // ----- Payments ----------------------------------------------------------
  // Script processor outcomes BEFORE creating payment records.
  processor.script(SEED_IDEM_KEYS.PAY_ALPHA_1, { outcome: "SUCCESS" });
  processor.script(SEED_IDEM_KEYS.PAY_ALPHA_2, { outcome: "TRANSIENT_FAILURE" });
  processor.script(SEED_IDEM_KEYS.PAY_ALPHA_3, { outcome: "HARD_DECLINE" });
  processor.script(SEED_IDEM_KEYS.PAY_BETA_1, { outcome: "SUCCESS" });
  processor.script(SEED_IDEM_KEYS.PAY_BETA_2, { outcome: "TRANSIENT_FAILURE" });
  processor.script(SEED_IDEM_KEYS.PAY_BETA_3, { outcome: "HARD_DECLINE" });

  const backoff0 = (policy.paymentBackoffSeconds[0] ?? 60) * 1_000;

  const payments: Payment[] = [
    {
      id: SEED_IDS.PAY_ALPHA_1,
      tenantId: SEED_IDS.TENANT_ALPHA,
      accountId: SEED_IDS.ACCOUNT_ALPHA_1,
      idempotencyKey: SEED_IDEM_KEYS.PAY_ALPHA_1,
      amount: money(500_000, policy.refundCurrency),
      status: "SUCCEEDED",
      attempts: 1,
      createdAt: now,
      lastUpdatedAt: now,
    },
    {
      id: SEED_IDS.PAY_ALPHA_2,
      tenantId: SEED_IDS.TENANT_ALPHA,
      accountId: SEED_IDS.ACCOUNT_ALPHA_1,
      idempotencyKey: SEED_IDEM_KEYS.PAY_ALPHA_2,
      amount: money(200_000, policy.refundCurrency),
      status: "FAILED",
      failureKind: "TRANSIENT",
      attempts: 1,
      nextRetryAt: now + backoff0,
      createdAt: now,
      lastUpdatedAt: now,
    },
    {
      id: SEED_IDS.PAY_ALPHA_3,
      tenantId: SEED_IDS.TENANT_ALPHA,
      accountId: SEED_IDS.ACCOUNT_ALPHA_1,
      idempotencyKey: SEED_IDEM_KEYS.PAY_ALPHA_3,
      amount: money(100_000, policy.refundCurrency),
      status: "FAILED",
      failureKind: "HARD_DECLINE",
      attempts: 1,
      createdAt: now,
      lastUpdatedAt: now,
    },
    {
      id: SEED_IDS.PAY_BETA_1,
      tenantId: SEED_IDS.TENANT_BETA,
      accountId: SEED_IDS.ACCOUNT_BETA_1,
      idempotencyKey: SEED_IDEM_KEYS.PAY_BETA_1,
      amount: money(300_000, policy.refundCurrency),
      status: "SUCCEEDED",
      attempts: 1,
      createdAt: now,
      lastUpdatedAt: now,
    },
    {
      id: SEED_IDS.PAY_BETA_2,
      tenantId: SEED_IDS.TENANT_BETA,
      accountId: SEED_IDS.ACCOUNT_BETA_1,
      idempotencyKey: SEED_IDEM_KEYS.PAY_BETA_2,
      amount: money(150_000, policy.refundCurrency),
      status: "FAILED",
      failureKind: "TRANSIENT",
      attempts: 1,
      nextRetryAt: now + backoff0,
      createdAt: now,
      lastUpdatedAt: now,
    },
    {
      id: SEED_IDS.PAY_BETA_3,
      tenantId: SEED_IDS.TENANT_BETA,
      accountId: SEED_IDS.ACCOUNT_BETA_1,
      idempotencyKey: SEED_IDEM_KEYS.PAY_BETA_3,
      amount: money(75_000, policy.refundCurrency),
      status: "FAILED",
      failureKind: "HARD_DECLINE",
      attempts: 1,
      createdAt: now,
      lastUpdatedAt: now,
    },
  ];
  for (const p of payments) stores.payments.set(p);

  // ----- Webhooks ----------------------------------------------------------
  const webhooks: WebhookSubscription[] = [
    {
      id: SEED_IDS.WEBHOOK_ALPHA_1,
      tenantId: SEED_IDS.TENANT_ALPHA,
      eventType: "order.completed",
      endpointLabel: "alpha-primary-endpoint",
      status: "ACTIVE",
      createdAt: now,
    },
    {
      id: SEED_IDS.WEBHOOK_ALPHA_2,
      tenantId: SEED_IDS.TENANT_ALPHA,
      eventType: "payment.failed",
      endpointLabel: "alpha-alerts-endpoint",
      status: "ACTIVE",
      createdAt: now,
    },
    {
      id: SEED_IDS.WEBHOOK_BETA_1,
      tenantId: SEED_IDS.TENANT_BETA,
      eventType: "order.completed",
      endpointLabel: "beta-primary-endpoint",
      status: "ACTIVE",
      createdAt: now,
    },
  ];
  for (const w of webhooks) stores.webhooks.set(w);

  // ----- Worker jobs -------------------------------------------------------
  const jobs: BackgroundJob[] = [
    {
      id: SEED_IDS.JOB_ALPHA_1,
      tenantId: SEED_IDS.TENANT_ALPHA,
      jobType: "send-retention-report",
      payload: { tenantId: SEED_IDS.TENANT_ALPHA },
      status: "PENDING",
      createdAt: now,
    },
    {
      id: SEED_IDS.JOB_BETA_1,
      tenantId: SEED_IDS.TENANT_BETA,
      jobType: "send-retention-report",
      payload: { tenantId: SEED_IDS.TENANT_BETA },
      status: "PENDING",
      createdAt: now,
    },
  ];
  for (const j of jobs) stores.jobs.set(j);
}
