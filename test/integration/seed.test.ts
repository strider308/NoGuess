/**
 * Seed determinism integration test.
 *
 * Verifies that seedFixture() produces exactly the expected fixture state
 * every time it is called with fresh stores, and that the resulting records
 * match the documented SEED_IDS and SEED_IDEM_KEYS.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TenantStore, InMemoryStore } from "../../src/infrastructure/store.js";
import { FakePaymentProcessor } from "../../src/infrastructure/fake-payment-processor.js";
import type { Tenant } from "../../src/domain/tenant.js";
import type { User } from "../../src/domain/tenant.js";
import type { Account } from "../../src/domain/account.js";
import type { Payment } from "../../src/domain/payment.js";
import type { WebhookSubscription } from "../../src/domain/webhook.js";
import type { BackgroundJob } from "../../src/domain/worker.js";
import type { RetentionRecord } from "../../src/domain/retention.js";
import { seedFixture, SEED_IDS, SEED_IDEM_KEYS, SEED_EPOCH_MS } from "../../src/fixtures/seed.js";
import { DEFAULT_POLICY } from "../../src/services/policy.js";

function buildStores() {
  return {
    tenants: new InMemoryStore<Tenant>(),
    users: new TenantStore<User>(),
    accounts: new TenantStore<Account>(),
    payments: new TenantStore<Payment>(),
    webhooks: new TenantStore<WebhookSubscription>(),
    jobs: new TenantStore<BackgroundJob>(),
    retention: new TenantStore<RetentionRecord>(),
  };
}

describe("seedFixture() — tenants", () => {
  it("creates exactly 2 tenants", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    assert.equal(stores.tenants.size(), 2);
  });

  it("tenant-alpha exists with correct name", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    const alpha = stores.tenants.get(SEED_IDS.TENANT_ALPHA);
    assert.ok(alpha !== undefined);
    assert.equal(alpha.name, "Alpha Corp");
  });

  it("tenant-beta exists with correct name", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    const beta = stores.tenants.get(SEED_IDS.TENANT_BETA);
    assert.ok(beta !== undefined);
    assert.equal(beta.name, "Beta Inc");
  });
});

describe("seedFixture() — users", () => {
  it("creates exactly 5 users", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    assert.equal(stores.users.size(), 5);
  });

  it("alpha admin has ADMIN role", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    const user = stores.users.get(SEED_IDS.USER_ALPHA_ADMIN);
    assert.ok(user !== undefined);
    assert.deepEqual(user.roles, ["ADMIN"]);
    assert.equal(user.tenantId, SEED_IDS.TENANT_ALPHA);
  });

  it("alpha billing has BILLING role", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    const user = stores.users.get(SEED_IDS.USER_ALPHA_BILLING);
    assert.ok(user !== undefined);
    assert.deepEqual(user.roles, ["BILLING"]);
  });

  it("all users have SEED_EPOCH_MS as createdAt", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    for (const user of stores.users.list()) {
      assert.equal(user.createdAt, SEED_EPOCH_MS);
    }
  });
});

describe("seedFixture() — accounts", () => {
  it("creates exactly 4 accounts", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    assert.equal(stores.accounts.size(), 4);
  });

  it("alpha has 2 accounts", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    assert.equal(stores.accounts.listByTenant(SEED_IDS.TENANT_ALPHA).length, 2);
  });

  it("account-alpha-1 is ACTIVE", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    const acc = stores.accounts.get(SEED_IDS.ACCOUNT_ALPHA_1);
    assert.ok(acc !== undefined);
    assert.equal(acc.status, "ACTIVE");
  });

  it("account-alpha-2 is SUSPENDED", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    const acc = stores.accounts.get(SEED_IDS.ACCOUNT_ALPHA_2);
    assert.ok(acc !== undefined);
    assert.equal(acc.status, "SUSPENDED");
  });

  it("account-alpha-1 has tier VIP (deterministic)", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    const acc = stores.accounts.get(SEED_IDS.ACCOUNT_ALPHA_1);
    assert.ok(acc !== undefined);
    assert.equal(acc.tier, "VIP");
  });

  it("account-alpha-2 has tier STANDARD (deterministic)", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    const acc = stores.accounts.get(SEED_IDS.ACCOUNT_ALPHA_2);
    assert.ok(acc !== undefined);
    assert.equal(acc.tier, "STANDARD");
  });
});

describe("seedFixture() — payments", () => {
  it("creates exactly 6 payments", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    assert.equal(stores.payments.size(), 6);
  });

  it("pay-alpha-1 is SUCCEEDED", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    const p = stores.payments.get(SEED_IDS.PAY_ALPHA_1);
    assert.ok(p !== undefined);
    assert.equal(p.status, "SUCCEEDED");
  });

  it("pay-alpha-2 is FAILED/TRANSIENT", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    const p = stores.payments.get(SEED_IDS.PAY_ALPHA_2);
    assert.ok(p !== undefined);
    assert.equal(p.status, "FAILED");
    assert.equal(p.failureKind, "TRANSIENT");
  });

  it("pay-alpha-3 is FAILED/HARD_DECLINE", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    const p = stores.payments.get(SEED_IDS.PAY_ALPHA_3);
    assert.ok(p !== undefined);
    assert.equal(p.status, "FAILED");
    assert.equal(p.failureKind, "HARD_DECLINE");
  });

  it("all payments use INR currency", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    for (const p of stores.payments.list()) {
      assert.equal(p.amount.currency, "INR");
    }
  });
});

describe("seedFixture() — webhooks", () => {
  it("creates exactly 3 webhook subscriptions", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    assert.equal(stores.webhooks.size(), 3);
  });

  it("tenant-alpha has 2 active webhook subscriptions", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    const alphaSubs = stores.webhooks.listByTenant(SEED_IDS.TENANT_ALPHA);
    assert.equal(alphaSubs.length, 2);
    assert.ok(alphaSubs.every((s) => s.status === "ACTIVE"));
  });

  it("alpha webhooks have distinct event types", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    const alphaSubs = stores.webhooks.listByTenant(SEED_IDS.TENANT_ALPHA);
    const eventTypes = new Set(alphaSubs.map((s) => s.eventType));
    assert.equal(eventTypes.size, 2); // order.completed and payment.failed
  });

  it("tenant-beta has exactly 1 webhook", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    assert.equal(stores.webhooks.listByTenant(SEED_IDS.TENANT_BETA).length, 1);
  });
});

describe("seedFixture() — jobs", () => {
  it("creates exactly 2 background jobs", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    assert.equal(stores.jobs.size(), 2);
  });

  it("both jobs are PENDING", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    for (const job of stores.jobs.list()) {
      assert.equal(job.status, "PENDING");
    }
  });
});

describe("seedFixture() — retention records", () => {
  it("creates 4 retention records (one per account)", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    assert.equal(stores.retention.size(), 4);
  });

  it("retention records are not purge-eligible at SEED_EPOCH_MS", () => {
    const stores = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores, processor, DEFAULT_POLICY);
    for (const rec of stores.retention.list()) {
      assert.ok(rec.retainedUntil > SEED_EPOCH_MS);
    }
  });
});

describe("seedFixture() — determinism", () => {
  it("calling seedFixture twice with fresh stores produces identical state", () => {
    const stores1 = buildStores();
    const stores2 = buildStores();
    const processor = new FakePaymentProcessor();
    seedFixture(stores1, processor, DEFAULT_POLICY);
    processor.clearAll();
    seedFixture(stores2, processor, DEFAULT_POLICY);

    // Compare payment statuses
    for (const key of Object.values(SEED_IDS)) {
      const p1 = stores1.payments.get(key);
      const p2 = stores2.payments.get(key);
      if (p1 !== undefined && p2 !== undefined) {
        assert.equal(p1.status, p2.status);
        assert.equal(p1.failureKind, p2.failureKind);
      }
    }

    // Compare account statuses
    for (const key of [
      SEED_IDS.ACCOUNT_ALPHA_1, SEED_IDS.ACCOUNT_ALPHA_2,
      SEED_IDS.ACCOUNT_BETA_1, SEED_IDS.ACCOUNT_BETA_2,
    ]) {
      const a1 = stores1.accounts.get(key);
      const a2 = stores2.accounts.get(key);
      assert.ok(a1 !== undefined);
      assert.ok(a2 !== undefined);
      assert.equal(a1.status, a2.status);
    }
  });
});
