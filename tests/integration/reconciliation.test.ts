import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeMonimeServer } from "@/server/integrations/monime/fake";
import { AuthTokenRepository } from "@/server/repositories/AuthTokenRepository";
import { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import { JobRepository } from "@/server/repositories/JobRepository";
import { LedgerRepository } from "@/server/repositories/LedgerRepository";
import { PaymentRepository } from "@/server/repositories/PaymentRepository";
import { PayoutMethodRepository } from "@/server/repositories/PayoutMethodRepository";
import { PayoutRepository } from "@/server/repositories/PayoutRepository";
import { PlatformSettingsRepository } from "@/server/repositories/PlatformSettingsRepository";
import { ProductRepository } from "@/server/repositories/ProductRepository";
import { ShoutoutRepository } from "@/server/repositories/ShoutoutRepository";
import { UserRepository } from "@/server/repositories/UserRepository";
import { ContributionService } from "@/server/services/ContributionService";
import { JobService, type JobContext } from "@/server/services/JobService";
import { PlatformSettingsService } from "@/server/services/PlatformSettingsService";
import { PLATFORM_SUBJECT_ID, ReconciliationService } from "@/server/services/ReconciliationService";
import type { AlertInput } from "@/server/services/RiskService";
import { SettlementService } from "@/server/services/SettlementService";
import { TransferService } from "@/server/services/TransferService";
import { WalletService } from "@/server/services/WalletService";
import { createTestDb, type TestDb } from "./db";

// Phase 9: the cron safety net on real SQL. Lost webhooks, stuck transfers, wallets Monime never
// created, ledger drift and housekeeping all resolve through the normal service paths, and a
// job never runs twice at once.

const MIN = 60_000;

let t: TestDb;
let monimeServer: FakeMonimeServer;
let platformId: string;
let creatorId: string;
let alerts: AlertInput[];
let payoutCalls: string[];
let contributions: ContributionService;
let settlement: SettlementService;
let wallet: WalletService;
let reconciliation: ReconciliationService;
let reconciliationDeps: ConstructorParameters<typeof ReconciliationService>[0];

const repos = {
  users: new UserRepository(),
  profiles: new CreatorProfileRepository(),
  wallets: new CreatorWalletRepository(),
  payments: new PaymentRepository(),
  shoutouts: new ShoutoutRepository(),
  ledger: new LedgerRepository(),
  settings: new PlatformSettingsRepository(),
  payouts: new PayoutRepository(),
  payoutMethods: new PayoutMethodRepository(),
  authTokens: new AuthTokenRepository(),
  products: new ProductRepository(),
  jobs: new JobRepository(),
};

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

beforeEach(async () => {
  await t.client.exec(
    `truncate job_runs, job_leases, risk_alerts, account_deletions, product_assets, products, ledger_entries, ledger_journals, payment_events, contributions, payments,
     password_reset_tokens, verification_tokens, creator_wallets, creator_profiles, users cascade`,
  );
  await t.client.exec(readFileSync("server/db/migrations/0005_seed_platform_settings.sql", "utf8"));
  alerts = [];
  payoutCalls = [];
  monimeServer = new FakeMonimeServer();
  const monime = monimeServer.client();
  platformId = monimeServer.seedAccount({ id: "fac-platform" }).id;
  const settings = new PlatformSettingsService(repos.settings);
  const transfers = new TransferService({ repos, monime, platformAccountId: () => platformId, sleep: async () => {} });
  settlement = new SettlementService({ repos, transfers, settings, monime });
  contributions = new ContributionService({
    repos,
    monime,
    settings,
    platformAccountId: () => platformId,
    appBaseUrl: "https://dumegud.test",
    rateLimit: async () => {},
  });
  wallet = new WalletService(repos, monime);
  reconciliationDeps = {
    repos,
    wallet,
    settlement,
    transfers,
    payouts: {
      dispatch: async (id) => void payoutCalls.push(`dispatch:${id}`) as never,
      syncFromMonime: async (id) => void payoutCalls.push(`sync:${id}`),
    },
    risk: { raise: async (a) => void alerts.push(a) },
    settings,
    monime,
    platformAccountId: () => platformId,
    storage: null,
    buckets: { products: "products", public: "public" },
  };
  reconciliation = new ReconciliationService(reconciliationDeps);

  const user = (await repos.users.insertIfEmailFree({ email: "aminata@example.com", name: "Aminata", passwordHash: null }))!;
  creatorId = user.id;
  await wallet.provisionForCreator(user.id);
  await repos.profiles.insert(user.id, { handle: "aminata", handleLower: "aminata", displayName: "Aminata", bio: "", categoryId: null, supportMessageEnabled: true });
  await repos.profiles.setStatusOwned(user.id, "published", new Date());
});

/** A job context `minutes` from now, with all the time in the world. */
const later = (minutes: number): JobContext => ({ now: new Date(Date.now() + minutes * MIN), hasTime: () => true });

const startSupport = async (amount = 10_000) =>
  (await contributions.start({ handle: "aminata", amount, supporterName: "Kadiatu", message: "", isAnonymous: false }, { ip: "203.0.113.9", userAgent: "vitest" })).paymentId;

const payment = async (id: string) => (await repos.payments.findById(id))!;

describe("JobService", () => {
  it("runs one job at a time and records every invocation", async () => {
    const jobs = new JobService({ repos });
    let inner: Awaited<ReturnType<JobService["run"]>> | undefined;
    const outer = await jobs.run("retry-transfers", async () => {
      inner = await jobs.run("retry-transfers", async () => ({ processed: 99, errors: 0 }));
      return { processed: 2, errors: 1 };
    });
    expect(outer).toMatchObject({ status: "succeeded", processed: 2, errors: 1 });
    expect(inner).toMatchObject({ status: "skipped", processed: 0 });

    // Released afterwards: the next run goes ahead.
    expect((await jobs.run("retry-transfers", async () => ({ processed: 0, errors: 0 }))).status).toBe("succeeded");
    const { rows } = await t.client.query<{ status: string }>("select status from job_runs order by started_at, status");
    expect(rows.map((r) => r.status).sort()).toEqual(["skipped", "succeeded", "succeeded"]);
  });

  it("records a failed run and frees the lease", async () => {
    const jobs = new JobService({ repos });
    expect(await jobs.run("ledger-drift", async () => Promise.reject(new Error("boom")))).toMatchObject({ status: "failed", errors: 1 });
    const { rows } = await t.client.query<{ status: string; error: string }>("select status, error from job_runs");
    expect(rows).toEqual([{ status: "failed", error: "boom" }]);
    expect((await jobs.run("ledger-drift", async () => ({ processed: 0, errors: 0 }))).status).toBe("succeeded");
  });

  it("takes over a lease left behind by a crashed run once it expires", async () => {
    const now = new Date();
    expect(await repos.jobs.claimLease("cleanup", crypto.randomUUID(), now, new Date(now.getTime() + 5 * MIN))).toBe(true);
    expect(await repos.jobs.claimLease("cleanup", crypto.randomUUID(), now, new Date(now.getTime() + 5 * MIN))).toBe(false);
    const after = new Date(now.getTime() + 6 * MIN);
    expect(await repos.jobs.claimLease("cleanup", crypto.randomUUID(), after, new Date(after.getTime() + 5 * MIN))).toBe(true);
  });

  it("stops taking rows once the time budget is used up", async () => {
    await repos.wallets.recordFailure(creatorId, "x", 5, new Date(0));
    const result = await reconciliation.provisionWallets({ now: new Date(), hasTime: () => false });
    expect(result).toEqual({ processed: 0, errors: 0 });
  });
});

describe("reconcile-payments", () => {
  it("settles a payment whose webhooks were lost, then transfers it on the estimated fee", async () => {
    const id = await startSupport();
    monimeServer.completeCheckout((await payment(id)).monimeCheckoutSessionId!); // events never delivered

    expect((await reconciliation.reconcilePayments(later(10))).processed).toBe(0); // too early
    const result = await reconciliation.reconcilePayments(later(16));
    expect(result.processed).toBe(1);
    expect(result.tags).toHaveLength(1);
    expect(await payment(id)).toMatchObject({ status: "succeeded", monimeFeeMinor: null, transferStatus: "none" });

    // Monime's fee never arrives: retry-transfers settles on the estimate and moves the money.
    await reconciliation.retryTransfers(later(32));
    expect(await payment(id)).toMatchObject({ monimeFeeSource: "estimated", transferStatus: "completed", settlementFrozen: true });
    expect(monimeServer.transfers.size).toBe(1);

    const { rows } = await t.client.query<{ source: string }>("select source from payment_events where payment_id = $1 and to_status = 'succeeded'", [id]);
    expect(rows).toEqual([{ source: "cron" }]);
  });

  it("expires a checkout Monime still calls open long after its session expired", async () => {
    const id = await startSupport();
    const session = monimeServer.sessions.get((await payment(id)).monimeCheckoutSessionId!)!;

    await reconciliation.reconcilePayments(later(20)); // session still valid for 10 more minutes
    expect((await payment(id)).status).toBe("pending");

    session.expireTime = new Date(Date.now() - 60 * MIN).toISOString();
    await reconciliation.reconcilePayments(later(20));
    expect((await payment(id)).status).toBe("expired");
  });

  it("closes a checkout Monime reports as cancelled", async () => {
    const id = await startSupport();
    monimeServer.endCheckout((await payment(id)).monimeCheckoutSessionId!, "cancelled");
    await reconciliation.reconcilePayments(later(16));
    expect((await payment(id)).status).toBe("canceled");
  });
});

async function settledWithFailedTransfer() {
  const id = await startSupport();
  monimeServer.failNext(400, "validation_error", "Simulated rejection", "/internal-transfers");
  await settlement.resync(id); // completes the checkout through the poll path...
  monimeServer.completeCheckout((await payment(id)).monimeCheckoutSessionId!);
  await settlement.resync(id);
  await settlement.settleWithEstimate(id); // ...splits and tries the transfer, which Monime rejects
  expect(await payment(id)).toMatchObject({ transferStatus: "failed", transferAttempts: 1 });
  return id;
}

describe("retry-transfers", () => {
  it("retries a failed transfer with a fresh key", async () => {
    const id = await settledWithFailedTransfer();
    expect((await reconciliation.retryTransfers(later(1))).processed).toBe(0); // touched too recently
    await reconciliation.retryTransfers(later(3));
    expect(await payment(id)).toMatchObject({ transferStatus: "completed", settlementFrozen: true });
    const keys = monimeServer.requests.filter((r) => r.path === "/internal-transfers").map((r) => r.idempotencyKey);
    expect(keys).toEqual([`transfer-${id}-0`, `transfer-${id}-1`]);
  });

  it("re-sends a transfer left pending without a Monime id, with the same key", async () => {
    const id = await settledWithFailedTransfer();
    await t.client.query("update payments set transfer_status = 'pending', transfer_id = null where id = $1", [id]);
    await reconciliation.retryTransfers(later(3));
    expect((await payment(id)).transferStatus).toBe("completed");
    const keys = monimeServer.requests.filter((r) => r.path === "/internal-transfers").map((r) => r.idempotencyKey);
    expect(keys).toEqual([`transfer-${id}-0`, `transfer-${id}-1`]);
  });

  it("leaves a payment to staff after too many definitive failures", async () => {
    const id = await settledWithFailedTransfer();
    await t.client.query("update payments set transfer_attempts = 5 where id = $1", [id]);
    expect((await reconciliation.retryTransfers(later(3))).processed).toBe(0);
    expect((await payment(id)).transferStatus).toBe("failed");
  });
});

describe("transfer races", () => {
  it("a late failure of an older transfer can't fail a newer attempt or change its key", async () => {
    const id = await settledWithFailedTransfer();
    await t.client.query("update payments set transfer_status = 'pending', transfer_id = 'trf-new' where id = $1", [id]);
    expect(await repos.payments.markTransferFailed(id, { transferId: "trf-old" }, true, "replayed")).toBeNull();
    expect(await repos.payments.markTransferFailed(id, { attempt: 1 }, true, "stale start")).toBeNull(); // has a transfer id now
    expect(await payment(id)).toMatchObject({ transferStatus: "pending", transferId: "trf-new", transferAttempts: 1 });
  });

  it("a new claim clears the previous attempt's transfer id", async () => {
    const id = await settledWithFailedTransfer();
    await t.client.query("update payments set transfer_id = 'trf-old' where id = $1", [id]);
    expect(await repos.payments.claimTransfer(id)).toMatchObject({ transferStatus: "pending", transferId: null });
  });

  it("refreshPending leaves a fresh claim (request in flight) alone, and re-sends a stale one", async () => {
    const id = await settledWithFailedTransfer();
    await t.client.query("update payments set transfer_status = 'pending', transfer_id = null, updated_at = now() where id = $1", [id]);
    const sent = () => monimeServer.requests.filter((r) => r.path === "/internal-transfers").length;
    const before = sent();
    expect(await reconciliationDeps.transfers.refreshPending(id, new Date())).toBe("pending");
    expect(sent()).toBe(before);
    expect(await reconciliationDeps.transfers.refreshPending(id, later(3).now)).toBe("completed");
    expect(sent()).toBe(before + 1);
  });

  it("never claims a transfer into a wallet frozen after the check", async () => {
    const id = await settledWithFailedTransfer();
    await repos.wallets.freeze(creatorId);
    expect(await repos.payments.claimTransfer(id)).toBeNull();
    expect((await payment(id)).transferStatus).toBe("failed");
  });

  it("wallet provisioning finishing after a freeze keeps the wallet frozen", async () => {
    const user = (await repos.users.insertIfEmailFree({ email: "musa@example.com", name: "Musa", passwordHash: null }))!;
    await repos.wallets.ensure(user.id);
    await repos.wallets.freeze(user.id);
    expect(await repos.wallets.markActive(user.id, { id: "fac-late", uvan: "u" }, new Date())).toMatchObject({ status: "frozen", monimeFinancialAccountId: "fac-late" });
    expect(await repos.wallets.recordFailure(user.id, "x", 5, new Date())).toMatchObject({ status: "frozen", attempts: 0 });
  });
});

describe("provision-wallets", () => {
  it("retries wallets with backoff, past the request-time limit, up to 10 attempts", async () => {
    const user = (await repos.users.insertIfEmailFree({ email: "musa@example.com", name: "Musa", passwordHash: null }))!;
    for (let i = 0; i < 5; i++) {
      monimeServer.failNext(500, "internal_error", "down", "/financial-accounts");
      await wallet.provisionForCreator(user.id);
    }
    const failed = (await repos.wallets.findByUserId(user.id))!;
    expect(failed).toMatchObject({ status: "failed", attempts: 5 });

    // 2^5 = 32 minutes of backoff after the last attempt.
    await reconciliation.provisionWallets({ now: new Date(failed.lastAttemptAt!.getTime() + 20 * MIN), hasTime: () => true });
    expect((await repos.wallets.findByUserId(user.id))!.status).toBe("failed");
    await reconciliation.provisionWallets({ now: new Date(failed.lastAttemptAt!.getTime() + 33 * MIN), hasTime: () => true });
    expect((await repos.wallets.findByUserId(user.id))!.status).toBe("active");

    await t.client.query("update creator_wallets set status = 'failed', attempts = 10 where user_id = $1", [user.id]);
    expect((await reconciliation.provisionWallets(later(24 * 60))).processed).toBe(0);
  });
});

describe("reconcile-payouts", () => {
  it("reads processing payouts and re-sends requested ones once they've gone quiet", async () => {
    const { rows: methods } = await t.client.query<{ id: string }>(
      `insert into payout_methods (user_id, provider_id, msisdn_enc, msisdn_hash, msisdn_last3, name_match, status, bound_at)
       values ($1, 'm17', 'enc', 'hash-p', '123', 'match', 'disabled', now()) returning id`,
      [creatorId],
    );
    const { rows } = await t.client.query<{ id: string }>(
      `insert into payouts (creator_id, payout_method_id, amount_minor, quoted_fee_minor, status, idempotency_key, destination_snapshot)
       values ($1, $2, 5000, 50, 'processing', 'payout-a', '{}') returning id`,
      [creatorId, methods[0].id],
    );
    const id = rows[0].id;

    await reconciliation.reconcilePayouts(later(5));
    expect(payoutCalls).toEqual([]); // updated 5 minutes ago: still waiting for the webhook
    await reconciliation.reconcilePayouts(later(11));
    expect(payoutCalls).toEqual([`sync:${id}`]);

    await t.client.query("update payouts set status = 'requested' where id = $1", [id]);
    await reconciliation.reconcilePayouts(later(11));
    expect(payoutCalls).toEqual([`sync:${id}`, `dispatch:${id}`]);
  });
});

describe("ledger-drift", () => {
  it("alerts once when a wallet's live balance doesn't match the ledger, and on the platform account", async () => {
    const id = await startSupport();
    monimeServer.completeCheckout((await payment(id)).monimeCheckoutSessionId!);
    await settlement.resync(id);
    await settlement.settleWithEstimate(id);
    expect((await payment(id)).transferStatus).toBe("completed");

    expect((await reconciliation.ledgerDrift(later(0))).detail).toEqual({ drifted: 0 });
    expect(alerts).toEqual([]);

    const walletAccount = (await repos.wallets.findByUserId(creatorId))!.monimeFinancialAccountId!;
    monimeServer.accounts.get(walletAccount)!.availableMinor -= 500;
    monimeServer.accounts.get(platformId)!.availableMinor += 50; // within the Le 1 tolerance
    await reconciliation.ledgerDrift(later(0));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ ruleCode: "LEDGER_DRIFT", subjectType: "creator", subjectId: creatorId, evidence: { driftMinor: -500 } });

    monimeServer.accounts.get(platformId)!.availableMinor += 1_000;
    await reconciliation.ledgerDrift(later(0));
    expect(alerts.at(-1)).toMatchObject({ subjectType: "platform", subjectId: PLATFORM_SUBJECT_ID, creatorId: null });
  });

  it("skips a wallet with a transfer still in flight", async () => {
    const id = await startSupport();
    monimeServer.completeCheckout((await payment(id)).monimeCheckoutSessionId!);
    await settlement.resync(id);
    await settlement.settleWithEstimate(id);
    await t.client.query("update payments set transfer_status = 'pending' where id = $1", [id]);
    const walletAccount = (await repos.wallets.findByUserId(creatorId))!.monimeFinancialAccountId!;
    monimeServer.accounts.get(walletAccount)!.availableMinor += 5_000;
    await reconciliation.ledgerDrift(later(0));
    expect(alerts).toEqual([]);
  });
});

describe("cleanup", () => {
  it("activates cooled payout methods and purges expired tokens", async () => {
    await t.client.query(
      `insert into payout_methods (user_id, provider_id, msisdn_enc, msisdn_hash, msisdn_last3, name_match, status, bound_at, cooldown_until)
       values ($1, 'm17', 'enc', 'hash-c', '123', 'match', 'cooling_off', now(), now() - interval '1 minute')`,
      [creatorId],
    );
    await t.client.query("insert into verification_tokens (identifier, token, expires) values ($1, 'old', now() - interval '1 hour'), ($1, 'live', now() + interval '1 hour')", [creatorId]);
    await t.client.query(
      `insert into password_reset_tokens (user_id, token_hash, expires_at, used_at) values
       ($1, 'expired', now() - interval '1 hour', null),
       ($1, 'used-long-ago', now() + interval '1 hour', now() - interval '2 days'),
       ($1, 'live', now() + interval '1 hour', null)`,
      [creatorId],
    );

    const result = await reconciliation.cleanup(later(0));
    expect(result.detail).toEqual({ payoutMethodsActivated: 1, tokensPurged: 3, filesPurged: 0 });
    expect((await repos.payoutMethods.current(creatorId))!.status).toBe("active");
    const { rows } = await t.client.query<{ n: string }>("select (select count(*) from verification_tokens) + (select count(*) from password_reset_tokens) as n");
    expect(Number(rows[0].n)).toBe(2);
  });

  it("deletes an erased creator's product files once no buyer can download them", async () => {
    const deleted: string[] = [];
    const withStorage = new ReconciliationService({
      ...reconciliationDeps,
      storage: { deleteObject: async (bucket, key) => void deleted.push(`${bucket}/${key}`) },
    });
    const { rows } = await t.client.query<{ id: string }>(
      `insert into products (creator_id, title, price_minor, download_limit, access_days, status)
       values ($1, 'Album', 5000, 5, 30, 'unpublished') returning id`,
      [creatorId],
    );
    const productId = rows[0].id;
    await t.client.query(
      `insert into product_assets (product_id, kind, r2_key, original_filename, mime_type, size_bytes) values
       ($1, 'file', 'files/album.zip', 'album.zip', 'application/zip', 10),
       ($1, 'preview_image', 'previews/cover.webp', 'cover.webp', 'image/webp', 10)`,
      [productId],
    );

    // Not erased yet: kept.
    await withStorage.cleanup(later(0));
    expect(deleted).toEqual([]);

    await t.client.query(
      "insert into account_deletions (user_id, requested_at, erase_after, erased_at) values ($1, now() - interval '31 days', now() - interval '1 day', now())",
      [creatorId],
    );
    const result = await withStorage.cleanup(later(0));
    expect(result.detail).toMatchObject({ filesPurged: 2 });
    expect(deleted.sort()).toEqual(["products/files/album.zip", "public/previews/cover.webp"]);

    // Purged once only.
    await withStorage.cleanup(later(0));
    expect(deleted).toHaveLength(2);
  });
});
