/**
 * Tenant isolation integration test.
 *
 * Verifies cross-domain invariant: an actor from tenant-beta cannot
 * read or mutate resources belonging to tenant-alpha, even if they
 * know the resource IDs.
 *
 * Tests span multiple services to confirm the isolation check is
 * consistently applied at every service boundary.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FakeClock } from "../../src/lib/clock.js";
import { IdFactory } from "../../src/lib/ids.js";
import { money } from "../../src/lib/money.js";
import { TenantStore } from "../../src/infrastructure/store.js";
import { FakePaymentProcessor } from "../../src/infrastructure/fake-payment-processor.js";
import { FakeKms } from "../../src/infrastructure/fake-kms.js";
import type { User } from "../../src/domain/tenant.js";
import type { Account } from "../../src/domain/account.js";
import type { Payment } from "../../src/domain/payment.js";
import type { Refund } from "../../src/domain/refund.js";
import type { ExportJob } from "../../src/domain/export.js";
import type { WebhookSubscription, WebhookDelivery } from "../../src/domain/webhook.js";
import type { BackgroundJob } from "../../src/domain/worker.js";
import { AccountService } from "../../src/services/account-service.js";
import { PaymentService } from "../../src/services/payment-service.js";
import { RefundService } from "../../src/services/refund-service.js";
import { ExportService } from "../../src/services/export-service.js";
import { WebhookService } from "../../src/services/webhook-service.js";
import { WorkerService } from "../../src/services/worker-service.js";
import { AuthService } from "../../src/services/auth-service.js";
import { DEFAULT_POLICY } from "../../src/services/policy.js";
import type { ActorContext } from "../../src/domain/tenant.js";

function buildServices() {
  const clock = new FakeClock(0);
  const ids = new IdFactory();
  const kms = new FakeKms();
  const processor = new FakePaymentProcessor();

  const userStore = new TenantStore<User>();
  const accountStore = new TenantStore<Account>();
  const paymentStore = new TenantStore<Payment>();
  const refundStore = new TenantStore<Refund>();
  const exportStore = new TenantStore<ExportJob>();
  const webhookSubStore = new TenantStore<WebhookSubscription>();
  const webhookDeliveryStore = new TenantStore<WebhookDelivery>();
  const jobStore = new TenantStore<BackgroundJob>();

  const authService = new AuthService(userStore, clock, ids, DEFAULT_POLICY, kms);
  const accountService = new AccountService(accountStore, clock, ids, DEFAULT_POLICY);
  const paymentService = new PaymentService(paymentStore, processor, clock, ids, DEFAULT_POLICY);
  const refundService = new RefundService(refundStore, clock, ids, DEFAULT_POLICY);
  const exportService = new ExportService(
    exportStore,
    { PAYMENTS: paymentStore as unknown as TenantStore<{ id: string; tenantId: string }> },
    clock,
    ids
  );
  const webhookService = new WebhookService(webhookSubStore, webhookDeliveryStore, clock, ids, DEFAULT_POLICY);
  const workerService = new WorkerService(jobStore, clock, ids);

  const alphaAdmin: ActorContext = {
    tenantId: "tenant-alpha",
    userId: "user-alpha-admin",
    roles: ["ADMIN"],
  };
  const betaAdmin: ActorContext = {
    tenantId: "tenant-beta",
    userId: "user-beta-admin",
    roles: ["ADMIN"],
  };

  // Seed users for auth test
  const kmsInst = new FakeKms();
  userStore.set({
    id: alphaAdmin.userId,
    tenantId: alphaAdmin.tenantId,
    name: "Alpha Admin",
    email: "admin@alpha.example",
    passwordHash: kmsInst.encrypt("alpha-admin-pass").ciphertext,
    roles: ["ADMIN"],
    createdAt: 0,
  });

  return {
    clock, ids, kms, processor,
    authService, accountService, paymentService, refundService,
    exportService, webhookService, workerService,
    alphaAdmin, betaAdmin,
  };
}

describe("Tenant isolation — AccountService", () => {
  it("beta admin cannot get an alpha account by ID", () => {
    const { accountService, alphaAdmin, betaAdmin } = buildServices();
    const created = accountService.createAccount(alphaAdmin, "Alpha Account");
    assert.ok(created.ok);
    const r = accountService.getAccount(betaAdmin, created.value.id);
    assert.ok(!r.ok);
    assert.match(r.error, /isolation violation/);
  });

  it("beta admin cannot suspend an alpha account", () => {
    const { accountService, alphaAdmin, betaAdmin } = buildServices();
    const created = accountService.createAccount(alphaAdmin, "Alpha Account");
    assert.ok(created.ok);
    const r = accountService.suspend(betaAdmin, created.value.id);
    assert.ok(!r.ok);
    assert.match(r.error, /isolation violation/);
  });

  it("listAccounts does not leak alpha accounts to beta", () => {
    const { accountService, alphaAdmin, betaAdmin } = buildServices();
    accountService.createAccount(alphaAdmin, "Alpha 1");
    accountService.createAccount(alphaAdmin, "Alpha 2");
    const betaList = accountService.listAccounts(betaAdmin);
    assert.equal(betaList.length, 0);
  });
});

describe("Tenant isolation — PaymentService", () => {
  it("beta cannot access alpha payment by ID", () => {
    const { paymentService, processor, alphaAdmin, betaAdmin } = buildServices();
    processor.script("iso-pay", { outcome: "SUCCESS" });
    const charge = paymentService.charge(alphaAdmin, "acc-1", money(100_000, "INR"), "iso-pay");
    assert.ok(charge.ok);
    const r = paymentService.getPayment(betaAdmin, charge.value.id);
    assert.ok(!r.ok);
    assert.match(r.error, /isolation violation/);
  });

  it("beta listPayments shows zero alpha payments", () => {
    const { paymentService, processor, alphaAdmin, betaAdmin } = buildServices();
    processor.script("iso-pay-2", { outcome: "SUCCESS" });
    paymentService.charge(alphaAdmin, "acc-1", money(100_000, "INR"), "iso-pay-2");
    const betaPayments = paymentService.listPayments(betaAdmin);
    assert.equal(betaPayments.length, 0);
  });
});

describe("Tenant isolation — RefundService", () => {
  it("beta cannot request a refund against an alpha payment's tenant", () => {
    const { refundService, betaAdmin } = buildServices();
    // beta actor tries to request a refund for a payment in tenant-alpha
    const r = refundService.requestRefund(betaAdmin, "tenant-alpha", "pay-alpha-1", 100);
    assert.ok(!r.ok);
    assert.match(r.error, /isolation violation/);
  });
});

describe("Tenant isolation — ExportService", () => {
  it("beta export returns zero alpha records", () => {
    const { exportService, paymentService, processor, alphaAdmin, betaAdmin } = buildServices();
    processor.script("iso-exp", { outcome: "SUCCESS" });
    paymentService.charge(alphaAdmin, "acc-1", money(100_000, "INR"), "iso-exp");

    const enqueue = exportService.enqueueExport(betaAdmin, "PAYMENTS");
    assert.ok(enqueue.ok);
    const r = exportService.runExport(betaAdmin, enqueue.value.id);
    assert.ok(r.ok);
    assert.equal(r.value.recordCount, 0);
  });
});

describe("Tenant isolation — WebhookService", () => {
  it("beta cannot see alpha deliveries", () => {
    const { webhookService, alphaAdmin, betaAdmin } = buildServices();
    webhookService.registerWebhook(alphaAdmin, "order.completed", "ep", () => true);
    webhookService.deliverEvent(alphaAdmin, "order.completed", { id: "1" });
    const betaDels = webhookService.listDeliveries(betaAdmin);
    assert.equal(betaDels.length, 0);
  });
});

describe("Tenant isolation — WorkerService", () => {
  it("beta cannot access alpha job by ID", () => {
    const { workerService, alphaAdmin, betaAdmin } = buildServices();
    const enqueue = workerService.enqueueJob(alphaAdmin, "test-job", {});
    assert.ok(enqueue.ok);
    const r = workerService.getJob(betaAdmin, enqueue.value.id);
    assert.ok(!r.ok);
    assert.match(r.error, /isolation violation/);
  });
});
