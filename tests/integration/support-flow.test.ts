import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeMonimeServer, type WebhookEnvelope } from "@/server/integrations/monime/fake";
import { parseMonimeEvent } from "@/server/integrations/monime/webhook";
import { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import { LedgerRepository } from "@/server/repositories/LedgerRepository";
import { PaymentRepository } from "@/server/repositories/PaymentRepository";
import { ShoutoutRepository } from "@/server/repositories/ShoutoutRepository";
import { PlatformSettingsRepository } from "@/server/repositories/PlatformSettingsRepository";
import { UserRepository } from "@/server/repositories/UserRepository";
import { WebhookEventRepository } from "@/server/repositories/WebhookEventRepository";
import { ContributionService } from "@/server/services/ContributionService";
import { accounts } from "@/server/services/ledger";
import { PlatformSettingsService } from "@/server/services/PlatformSettingsService";
import { SettlementService } from "@/server/services/SettlementService";
import { TransferService } from "@/server/services/TransferService";
import { WalletService } from "@/server/services/WalletService";
import { WebhookService } from "@/server/services/WebhookService";
import { createTestDb, type TestDb } from "./db";

// Phase 4 acceptance, end to end on real SQL: support → pending → webhook pair (either order)
// → succeeded with net = gross − Monime fee − platform fee → balanced ledger → one transfer.

let t: TestDb;
let monimeServer: FakeMonimeServer;
let platformId: string;
let now: Date;
const ctx = { ip: "203.0.113.9", userAgent: "vitest" };

const repos = {
  users: new UserRepository(),
  profiles: new CreatorProfileRepository(),
  wallets: new CreatorWalletRepository(),
  payments: new PaymentRepository(),
  shoutouts: new ShoutoutRepository(),
  ledger: new LedgerRepository(),
  settings: new PlatformSettingsRepository(),
  webhookEvents: new WebhookEventRepository(),
};

let contributions: ContributionService;
let settlement: SettlementService;
let webhooks: WebhookService;
let creatorId: string;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

beforeEach(async () => {
  // CASCADE from users also empties platform_settings (updated_by → users), so re-seed it.
  await t.client.exec(
    "truncate ledger_entries, ledger_journals, payment_events, contributions, payments, webhook_events, creator_wallets, creator_profiles, users cascade",
  );
  await t.client.exec(readFileSync("server/db/migrations/0005_seed_platform_settings.sql", "utf8"));
  now = new Date();
  monimeServer = new FakeMonimeServer();
  const monime = monimeServer.client();
  platformId = monimeServer.seedAccount({ id: "fac-platform" }).id;
  const settings = new PlatformSettingsService(repos.settings);
  const transfers = new TransferService({ repos, monime, platformAccountId: () => platformId, sleep: async () => {} });
  settlement = new SettlementService({ repos, transfers, settings, monime, now: () => now });
  contributions = new ContributionService({
    repos,
    monime,
    settings,
    platformAccountId: () => platformId,
    appBaseUrl: "https://dumegud.test",
    rateLimit: async () => {},
  });
  webhooks = new WebhookService(repos.webhookEvents, settlement.webhookHandlers());

  // A published creator with an active wallet, created through the real services.
  const user = (await repos.users.insertIfEmailFree({ email: "aminata@example.com", name: "Aminata", passwordHash: null }))!;
  creatorId = user.id;
  await new WalletService(repos, monime).provisionForCreator(user.id);
  await repos.profiles.insert(user.id, {
    handle: "aminata",
    handleLower: "aminata",
    displayName: "Aminata",
    bio: "",
    categoryId: null,
    supportMessageEnabled: true,
  });
  await repos.profiles.setStatusOwned(user.id, "published", now);
});

const startSupport = (amount = 30_000, extra: Partial<Parameters<ContributionService["start"]>[0]> = {}) =>
  contributions.start({ handle: "aminata", amount, supporterName: "Kadiatu", message: "Keep going!", isAnonymous: false, ...extra }, ctx);

const deliver = (e: WebhookEnvelope) => webhooks.handleMonime(parseMonimeEvent(JSON.stringify(e))!, e);

const payment = async (id: string) => (await repos.payments.findById(id))!;
const sessionOf = async (id: string) => (await payment(id)).monimeCheckoutSessionId!;

async function ledgerSum(): Promise<number> {
  const { rows } = await t.client.query<{ total: string | null }>("select sum(amount_minor)::text as total from ledger_entries");
  return Number(rows[0].total ?? 0);
}

describe("support flow", () => {
  it.each(["session-first", "payment-first"] as const)("settles, splits and transfers exactly once (%s)", async (order) => {
    const { paymentId, redirectUrl } = await startSupport();
    expect(redirectUrl).toMatch(/^https:\/\/checkout\.fake/);
    expect(await payment(paymentId)).toMatchObject({ status: "pending", platformFeeBps: 300 });
    expect(await settlement.getPublicStatus(paymentId)).toBe("processing");

    const events = monimeServer.completeCheckout(await sessionOf(paymentId), { order });
    for (const e of events) expect((await deliver(e)).response).toBe("ok");

    const p = await payment(paymentId);
    // 30,000 gross; Monime fees 225 + 75 = 300; arrived 29,700; 3% platform = 891; net 28,809
    expect(p).toMatchObject({
      status: "succeeded",
      monimeFeeMinor: 300,
      monimeFeeSource: "reported",
      arrivedMinor: 29_700,
      platformFeeMinor: 891,
      creatorNetMinor: 28_809,
      transferStatus: "completed",
      settlementFrozen: true,
    });
    expect(p.monimePaymentId).toMatch(/^spm-/);
    expect(p.payerFingerprintHash).toBeTruthy();
    expect(await settlement.getPublicStatus(paymentId)).toBe("succeeded");

    // Ledger: balanced, and it mirrors Monime's balances.
    expect(await ledgerSum()).toBe(0);
    expect(await repos.ledger.balance(accounts.creatorWallet(creatorId))).toBe(28_809);
    expect(await repos.ledger.balance(accounts.platformCash)).toBe(29_700 - 28_809);
    expect(await repos.ledger.balance(accounts.creatorPayable(creatorId))).toBe(-28_809);
    expect(await repos.ledger.balance(accounts.platformRevenue)).toBe(-891);
    const wallet = (await repos.wallets.findByUserId(creatorId))!;
    expect(monimeServer.accounts.get(wallet.monimeFinancialAccountId!)!.availableMinor).toBe(28_809);
    expect(monimeServer.accounts.get(platformId)!.availableMinor).toBe(891);

    // Replaying everything changes nothing.
    for (const e of [...events, ...events]) expect((await deliver(e)).response).toBe("ok");
    expect(monimeServer.transfers.size).toBe(1);
    const { rows } = await t.client.query("select 1 from ledger_journals");
    expect(rows).toHaveLength(2); // settle + transfer
  });

  it("handles both events delivered concurrently (and twice) with one transfer", async () => {
    const { paymentId } = await startSupport(20_000);
    const events = monimeServer.completeCheckout(await sessionOf(paymentId));
    await Promise.all([...events, ...events].map(deliver));
    expect(await payment(paymentId)).toMatchObject({ status: "succeeded", transferStatus: "completed", creatorNetMinor: 19_206 });
    expect(monimeServer.transfers.size).toBe(1);
    expect(await ledgerSum()).toBe(0);
  });

  it("never overwrites a fee with 0 or null, and a session-only success waits for the fee", async () => {
    const { paymentId } = await startSupport(10_000);
    const [sessionEvent, paymentEvent] = monimeServer.completeCheckout(await sessionOf(paymentId), { fees: null });
    await deliver(sessionEvent);
    await deliver(paymentEvent); // no fees reported
    expect(await payment(paymentId)).toMatchObject({ status: "succeeded", monimeFeeMinor: null, creatorNetMinor: null, transferStatus: "none" });
    expect(monimeServer.transfers.size).toBe(0);
  });

  it("settles on the estimate after the grace period, and a later reported fee becomes a variance", async () => {
    const { paymentId } = await startSupport(10_000);
    const [sessionEvent, paymentEvent] = monimeServer.completeCheckout(await sessionOf(paymentId));
    await deliver(sessionEvent);

    await settlement.settleWithEstimate(paymentId); // estimate: 1% of 10,000 = 100
    expect(await payment(paymentId)).toMatchObject({ monimeFeeMinor: 100, monimeFeeSource: "estimated", transferStatus: "completed" });

    // The reported fee here equals 100 (75 + 25 bps) → no variance. Force a different one:
    const data = paymentEvent.data as { fees: { amount: { value: number } }[] };
    data.fees[0].amount.value = 150; // reported total 175
    await deliver(paymentEvent);
    const p = await payment(paymentId);
    expect(p).toMatchObject({ monimeFeeMinor: 100, lateReportedFeeMinor: 175, creatorNetMinor: 9_603 });
    expect(await repos.ledger.balance(accounts.feeVariance)).toBe(75);
    expect(await ledgerSum()).toBe(0);
    expect(monimeServer.transfers.size).toBe(1);
  });

  it("ignores a cancel or expiry after success", async () => {
    const { paymentId } = await startSupport();
    const session = await sessionOf(paymentId);
    for (const e of monimeServer.completeCheckout(session)) await deliver(e);
    const lateCancel = { ...monimeServer.endCheckout(session, "cancelled") };
    await deliver(lateCancel);
    expect((await payment(paymentId)).status).toBe("succeeded");
  });

  it("marks a cancelled checkout canceled, and money arriving afterwards goes to review (no transfer)", async () => {
    const { paymentId } = await startSupport();
    const session = await sessionOf(paymentId);
    const cancelled = monimeServer.endCheckout(session, "cancelled");
    await deliver(cancelled);
    expect((await payment(paymentId)).status).toBe("canceled");
    expect(await settlement.getPublicStatus(paymentId)).toBe("failed");

    // Force the fake to "complete" it anyway (late success).
    monimeServer.sessions.get(session)!.status = "pending";
    for (const e of monimeServer.completeCheckout(session)) await deliver(e);
    expect((await payment(paymentId)).status).toBe("under_review");
    expect(monimeServer.transfers.size).toBe(0);
  });

  it("the success page never shows success without a webhook unless Monime says completed", async () => {
    const { paymentId } = await startSupport();
    expect(await settlement.getPublicStatus(paymentId)).toBe("processing");

    // Still unpaid at Monime after the wait → still processing.
    now = new Date(Date.now() + 25_000);
    expect(await settlement.getPublicStatus(paymentId)).toBe("processing");

    // Paid at Monime but webhooks lost → the poll fallback settles it (fee still unknown).
    monimeServer.completeCheckout(await sessionOf(paymentId));
    expect(await settlement.getPublicStatus(paymentId)).toBe("succeeded");
    expect(await payment(paymentId)).toMatchObject({ status: "succeeded", monimeFeeMinor: null });
  });

  it("holds an amount mismatch for review", async () => {
    const { paymentId } = await startSupport(5_000);
    const [, paymentEvent] = monimeServer.completeCheckout(await sessionOf(paymentId));
    (paymentEvent.data as { amount: { value: number } }).amount.value = 4_000;
    await deliver(paymentEvent);
    expect((await payment(paymentId)).status).toBe("under_review");
    expect(monimeServer.transfers.size).toBe(0);
  });

  it("retries a webhook that arrives before the checkout row exists", async () => {
    const outcome = await deliver({
      apiVersion: "x",
      event: { id: "wkd-early", name: "checkout_session.completed", timestamp: "0" },
      object: { id: "scs-unknown", type: "checkout_session" },
      data: { id: "scs-unknown", status: "completed", metadata: { paymentId: crypto.randomUUID() } },
    });
    expect(outcome.response).toBe("retry");
  });
});

describe("ContributionService.start", () => {
  it("enforces the configured amount range", async () => {
    await expect(startSupport(999)).rejects.toMatchObject({ fieldErrors: { amount: expect.any(Array) } });
    await expect(startSupport(50_001)).rejects.toMatchObject({ fieldErrors: { amount: expect.any(Array) } });
    await t.db.execute(sql`update platform_settings set value = '100000' where key = 'amounts.maxContribution'`);
    await expect(startSupport(50_001)).resolves.toBeDefined();
  });

  it("refuses unpublished creators and inactive wallets", async () => {
    await repos.profiles.setStatusOwned(creatorId, "unpublished", null);
    await expect(startSupport()).rejects.toMatchObject({ code: "NOT_FOUND" });
    await repos.profiles.setStatusOwned(creatorId, "published", now);
    await t.db.execute(sql`update creator_wallets set status = 'frozen'`);
    await expect(startSupport()).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("reuses an open checkout for a double tap, and stores no name for anonymous supporters", async () => {
    const a = await startSupport(5_000, { isAnonymous: true });
    const b = await startSupport(5_000, { isAnonymous: true });
    expect(b.paymentId).toBe(a.paymentId);
    const { rows } = await t.client.query<{ supporter_name: string | null }>("select supporter_name from contributions");
    expect(rows).toEqual([{ supporter_name: null }]);
  });

  it("marks the payment failed if Monime is down", async () => {
    monimeServer.failNext(503);
    await expect(startSupport()).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
    const { rows } = await t.client.query<{ status: string }>("select status from payments");
    expect(rows).toEqual([{ status: "failed" }]);
  });

  it("sends Monime string-only metadata without PII", async () => {
    await startSupport();
    const request = monimeServer.requests.find((r) => r.path === "/checkout-sessions")!;
    const body = request.body as { metadata: Record<string, string>; financialAccountId: string };
    expect(request.idempotencyKey).toMatch(/^checkout-/);
    expect(body.financialAccountId).toBe(platformId);
    expect(Object.keys(body.metadata).sort()).toEqual(["creatorId", "kind", "paymentId"]);
    expect(JSON.stringify(body)).not.toContain("Kadiatu");
  });
});

describe("creator views", () => {
  it("list succeeded and processing contributions separately, and show public names only when not anonymous", async () => {
    const paid = await startSupport(10_000);
    await startSupport(20_000, { isAnonymous: true, supporterName: "Secret" });
    for (const e of monimeServer.completeCheckout(await sessionOf(paid.paymentId))) await deliver(e);

    const actor = { userId: creatorId, status: "active" as const, emailVerified: true };
    const list = await contributions.listForCreator(actor);
    expect(list.succeeded).toHaveLength(1);
    expect(list.succeeded[0]).toMatchObject({ name: "Kadiatu", message: "Keep going!", grossMinor: 10_000, feeEstimated: false });
    expect(list.processing).toHaveLength(1);
    expect(list.processing[0].name).toBeNull();

    expect(await contributions.recentSupporters(creatorId)).toEqual([{ name: "Kadiatu", platform: null, handle: null }]);
    const other = { ...actor, userId: crypto.randomUUID() };
    expect((await contributions.listForCreator(other)).succeeded).toHaveLength(0);
  });
});
