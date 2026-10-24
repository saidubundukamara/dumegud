import { readFileSync } from "node:fs";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { EmailMessage } from "@/server/integrations/email";
import { FakeMonimeServer, type WebhookEnvelope } from "@/server/integrations/monime/fake";
import { parseMonimeEvent } from "@/server/integrations/monime/webhook";
import { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import { KycRepository } from "@/server/repositories/KycRepository";
import { LedgerRepository } from "@/server/repositories/LedgerRepository";
import { PaymentRepository } from "@/server/repositories/PaymentRepository";
import { PayoutMethodRepository } from "@/server/repositories/PayoutMethodRepository";
import { AccountDeletionRepository } from "@/server/repositories/AccountDeletionRepository";
import { PayoutRepository } from "@/server/repositories/PayoutRepository";
import { PlatformSettingsRepository } from "@/server/repositories/PlatformSettingsRepository";
import { UserRepository } from "@/server/repositories/UserRepository";
import { WebhookEventRepository } from "@/server/repositories/WebhookEventRepository";
import type { Actor } from "@/server/services/actor";
import { BalanceService } from "@/server/services/BalanceService";
import { KycService } from "@/server/services/KycService";
import { accounts, transferJournal } from "@/server/services/ledger";
import { PayoutMethodService } from "@/server/services/PayoutMethodService";
import { PayoutService } from "@/server/services/PayoutService";
import { PlatformSettingsService } from "@/server/services/PlatformSettingsService";
import { runInTransaction } from "@/server/services/transaction";
import { WalletService } from "@/server/services/WalletService";
import { WebhookService } from "@/server/services/WebhookService";
import type { KycSubmitInput } from "@/server/validation/wallet";
import { createMemoryStorage } from "../fixtures/creator-fakes";
import { createTestDb, type TestDb } from "./db";

// Phase 6 acceptance on real SQL: KYC → bind number (provider KYC + cooldown) → withdraw with
// fee on top → completion applied once → ledger mirrors Monime.

const MSISDN = "23276123456";
const HOLDER = "AMINATA KAMARA";

let t: TestDb;
let monimeServer: FakeMonimeServer;
let store: ReturnType<typeof createMemoryStorage>;
let sent: EmailMessage[];
let now: Date;
let creator: Actor;
let staff: Actor;
let walletAccountId: string;

const repos = {
  users: new UserRepository(),
  profiles: new CreatorProfileRepository(),
  wallets: new CreatorWalletRepository(),
  payments: new PaymentRepository(),
  ledger: new LedgerRepository(),
  settings: new PlatformSettingsRepository(),
  webhookEvents: new WebhookEventRepository(),
  kyc: new KycRepository(),
  payoutMethods: new PayoutMethodRepository(),
  payouts: new PayoutRepository(),
  accountDeletions: new AccountDeletionRepository(),
};

let kyc: KycService;
let methods: PayoutMethodService;
let payouts: PayoutService;
let balances: BalanceService;
let webhooks: WebhookService;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

beforeEach(async () => {
  await t.client.exec(
    `truncate payouts, payout_methods, kyc_submissions, ledger_entries, ledger_journals, payment_events, contributions,
     payments, webhook_events, creator_wallets, creator_profiles, users cascade`,
  );
  for (const f of ["0005_seed_platform_settings.sql", "0007_seed_product_settings.sql", "0009_seed_payout_settings.sql"]) {
    await t.client.exec(readFileSync(`server/db/migrations/${f}`, "utf8"));
  }
  now = new Date();
  sent = [];
  store = createMemoryStorage();
  monimeServer = new FakeMonimeServer();
  monimeServer.kyc.set(MSISDN, HOLDER);
  const monime = monimeServer.client();
  const settings = new PlatformSettingsService(repos.settings);
  const email = { send: async (m: EmailMessage) => void sent.push(m) };

  kyc = new KycService({ repos, storage: store.storage, bucket: "kyc", email, appBaseUrl: "https://dumegud.test", now: () => now, rateLimit: async () => {} });
  methods = new PayoutMethodService({ repos, kyc, monime, settings, email, appBaseUrl: "https://dumegud.test", now: () => now, rateLimit: async () => {} });
  balances = new BalanceService(repos, monime, settings);
  payouts = new PayoutService({ repos, monime, balances, methods, kyc, settings, email, appBaseUrl: "https://dumegud.test", now: () => now });
  webhooks = new WebhookService(repos.webhookEvents, payouts.webhookHandlers());

  const user = (await repos.users.insertIfEmailFree({ email: "aminata@example.com", name: "Aminata", passwordHash: null }))!;
  const wallet = await new WalletService(repos, monime).provisionForCreator(user.id);
  walletAccountId = wallet.monimeFinancialAccountId!;
  await repos.profiles.insert(user.id, { handle: "aminata", handleLower: "aminata", displayName: "Aminata", bio: "", categoryId: null, supportMessageEnabled: true });
  creator = { userId: user.id, role: "creator", status: "active", emailVerified: true };
  const reviewer = (await repos.users.insertIfEmailFree({ email: "staff@dumegud.test", name: "Staff", passwordHash: null }))!;
  staff = { userId: reviewer.id, role: "staff", status: "active", emailVerified: true };
});

/** Money the creator has earned: transferred into their wallet (ledger + fake Monime). */
async function earn(amountMinor: number) {
  const paymentId = crypto.randomUUID();
  await t.client.query(
    `insert into payments (id, kind, creator_id, status, gross_minor, platform_fee_bps, idempotency_key, creator_net_minor, settlement_frozen)
     values ($1, 'contribution', $2, 'succeeded', $3, 0, $4, $3, true)`,
    [paymentId, creator.userId, amountMinor, `earn-${paymentId}`],
  );
  await runInTransaction((tx) => repos.ledger.postJournal(transferJournal({ id: paymentId, creatorId: creator.userId, creatorNetMinor: amountMinor }), tx));
  monimeServer.accounts.get(walletAccountId)!.availableMinor += amountMinor;
}

async function stage(doc: string) {
  const { key } = await kyc.requestUpload(creator, { doc: doc as "selfie", contentType: "image/jpeg", size: 1000 });
  const jpeg = await sharp({ create: { width: 800, height: 500, channels: 3, background: "#abcdef" } })
    .jpeg()
    .withExif({ IFD0: { Copyright: "gps-and-camera" } })
    .toBuffer();
  store.put("kyc", key, jpeg);
  return key;
}

async function kycInput(overrides: Partial<KycSubmitInput> = {}): Promise<KycSubmitInput> {
  return {
    legalName: "Aminata Fatmata Kamara",
    dateOfBirth: "1995-04-02",
    idType: "national_id",
    idNumber: "SL123456",
    idFrontKey: await stage("id_front"),
    idBackKey: null,
    selfieKey: await stage("selfie"),
    ...overrides,
  };
}

async function verified() {
  await kyc.submit(creator, await kycInput());
  const [pending] = await kyc.listPending(staff);
  await kyc.decide(staff, pending.id, { outcome: "approved", note: null, reasonCode: null });
}

async function readyToWithdraw(balance = 50_000) {
  await verified();
  await methods.bind(creator, { phone: "076 123 456", providerId: null });
  now = new Date(now.getTime() + 25 * 3_600_000); // past the first-binding cooldown
  await earn(balance);
}

const deliver = (e: WebhookEnvelope) => webhooks.handleMonime(parseMonimeEvent(JSON.stringify(e))!, e);

describe("KYC", () => {
  it("stores documents re-encoded without EXIF, encrypts the name and verifies on approval", async () => {
    await kyc.submit(creator, await kycInput());
    const stored = [...store.objects.entries()].filter(([k]) => k.startsWith("kyc/kyc/"));
    expect(stored).toHaveLength(2);
    for (const [, o] of stored) expect((await sharp(o.body).metadata()).exif).toBeUndefined();
    expect([...store.objects.keys()].some((k) => k.includes("staging/"))).toBe(false);

    const { rows } = await t.client.query<{ legal_name_enc: string; id_number_hash: string }>("select legal_name_enc, id_number_hash from kyc_submissions");
    expect(rows[0].legal_name_enc).not.toContain("Kamara");
    expect(rows[0].id_number_hash).not.toContain("SL123456");

    await expect(kycInput()).rejects.toThrow(/already waiting/); // can't even stage new photos
    const [pending] = await kyc.listPending(staff);
    expect(pending.legalName).toBe("Aminata Fatmata Kamara");
    await expect(kyc.listPending(creator)).rejects.toMatchObject({ code: "FORBIDDEN" });

    await kyc.decide(staff, pending.id, { outcome: "approved", note: null, reasonCode: null });
    expect((await repos.profiles.findByUserId(creator.userId))!.verificationTier).toBe("id_verified");
    expect(sent.at(-1)?.tag).toBe("kyc-approved");
  });

  it("one ID document can verify only one account", async () => {
    await verified();
    const other = (await repos.users.insertIfEmailFree({ email: "other@example.com", name: "x", passwordHash: null }))!;
    const otherActor: Actor = { ...creator, userId: other.id };
    const stageFor = async () => {
      const { key } = await kyc.requestUpload(otherActor, { doc: "selfie", contentType: "image/jpeg", size: 10 });
      store.put("kyc", key, await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).jpeg().toBuffer());
      return key;
    };
    await kyc.submit(otherActor, {
      legalName: "Someone Else",
      dateOfBirth: "1990-01-01",
      idType: "national_id",
      idNumber: "SL123456", // the document the creator already used
      idFrontKey: await stageFor(),
      idBackKey: null,
      selfieKey: await stageFor(),
    });
    const [pending] = await kyc.listPending(staff);
    await expect(kyc.decide(staff, pending.id, { outcome: "approved", note: null, reasonCode: null })).rejects.toThrow(/another account/);
  });

  it("refuses another user's staging keys", async () => {
    const key = await stage("selfie");
    const other: Actor = { ...creator, userId: crypto.randomUUID() };
    await expect(kyc.submit(other, { ...(await kycInput()), selfieKey: key })).rejects.toThrow();
  });
});

describe("payout method", () => {
  it("needs approved KYC and a registered number", async () => {
    await expect(methods.bind(creator, { phone: "076123456", providerId: null })).rejects.toThrow(/Verify your identity/);
    await verified();
    await expect(methods.bind(creator, { phone: "076999999", providerId: null })).rejects.toMatchObject({ fieldErrors: { phone: [expect.stringContaining("isn't registered")] } });
  });

  it("binds with a 24h cooldown, and a change means 48h plus an email", async () => {
    await verified();
    const first = await methods.bind(creator, { phone: "076 123 456", providerId: null });
    expect(first).toMatchObject({ provider: "m17", status: "cooling_off", holderName: HOLDER, masked: "+232 ••• •• 456" });
    expect(first.cooldownUntil!.getTime() - now.getTime()).toBe(24 * 3_600_000);

    monimeServer.kyc.set("23276222333", HOLDER);
    const second = await methods.bind(creator, { phone: "076222333", providerId: null });
    expect(second.cooldownUntil!.getTime() - now.getTime()).toBe(48 * 3_600_000);
    expect(sent.at(-1)?.tag).toBe("payout-method-changed");
    const { rows } = await t.client.query<{ status: string }>("select status from payout_methods order by created_at");
    expect(rows.map((r) => r.status)).toEqual(["disabled", "cooling_off"]);
  });

  it("flags a holder name that doesn't match the verified legal name", async () => {
    await verified();
    monimeServer.kyc.set(MSISDN, "MOHAMED BANGURA");
    expect((await methods.bind(creator, { phone: MSISDN, providerId: "m17" })).status).toBe("needs_recheck");
  });
});

describe("withdrawals", () => {
  it("can't withdraw without KYC, during the cooldown, or above the max", async () => {
    await earn(50_000);
    await expect(payouts.request(creator, { amountMinor: 10_000 })).rejects.toThrow(/Verify your identity/);
    await verified();
    await methods.bind(creator, { phone: MSISDN, providerId: null });
    await expect(payouts.request(creator, { amountMinor: 10_000 })).rejects.toThrow(/new number open on/);
    now = new Date(now.getTime() + 25 * 3_600_000);

    const balance = await balances.getBalance(creator.userId);
    expect(balance).toMatchObject({ availableMinor: 50_000, maxWithdrawableMinor: 49_505, stale: false }); // 49,505 + 495 fee
    await expect(payouts.request(creator, { amountMinor: 49_506 })).rejects.toMatchObject({ fieldErrors: { amount: expect.any(Array) } });
    await expect(payouts.request(creator, { amountMinor: 4_999 })).rejects.toMatchObject({
      fieldErrors: { amount: [expect.stringContaining("minimum")] },
    });
  });

  it("pays out with the fee on top, applies completion once, and the ledger mirrors Monime", async () => {
    await readyToWithdraw(50_000);
    const payout = await payouts.request(creator, { amountMinor: 49_504 });
    expect(payout).toMatchObject({ status: "processing", quotedFeeMinor: 495, idempotencyKey: `payout-${payout.id}` });
    await expect(payouts.request(creator, { amountMinor: 5_000 })).rejects.toThrow(/already have a withdrawal/);

    const completed = monimeServer.settlePayout(payout.monimePayoutId!, "completed");
    await deliver(completed);
    await deliver(completed); // replay
    await payouts.syncFromMonime(payout.id); // the reconcile cron racing the webhook

    expect(await repos.payouts.findById(payout.id)).toMatchObject({ status: "completed", feeMinor: 495, feeSource: "reported", totalDebitMinor: 49_999, completionApplied: true });
    expect(await repos.ledger.balance(accounts.creatorWallet(creator.userId))).toBe(1);
    expect(monimeServer.accounts.get(walletAccountId)!.availableMinor).toBe(1);
    const { rows } = await t.client.query("select 1 from ledger_journals where kind = 'payout'");
    expect(rows).toHaveLength(1);
    expect(sent.filter((m) => m.tag === "payout-completed")).toHaveLength(1);
    const { rows: sum } = await t.client.query<{ total: string }>("select sum(amount_minor)::text as total from ledger_entries");
    expect(Number(sum[0].total)).toBe(0);
  });

  it("a failed payout refunds at Monime, leaves the ledger alone and allows a new request", async () => {
    await readyToWithdraw(20_000);
    const payout = await payouts.request(creator, { amountMinor: 10_000 });
    await deliver(monimeServer.settlePayout(payout.monimePayoutId!, "failed"));
    expect(await repos.payouts.findById(payout.id)).toMatchObject({ status: "failed", failureCode: "provider_rejected" });
    expect(await repos.ledger.balance(accounts.creatorWallet(creator.userId))).toBe(20_000);
    expect(monimeServer.accounts.get(walletAccountId)!.availableMinor).toBe(20_000);
    expect(sent.at(-1)?.tag).toBe("payout-failed");
    await expect(payouts.request(creator, { amountMinor: 10_000 })).resolves.toMatchObject({ status: "processing" });
  });

  it("refuses and flags the method when the number's registered holder changed (SIM swap)", async () => {
    await readyToWithdraw();
    monimeServer.kyc.set(MSISDN, "SOMEONE ELSE");
    await expect(payouts.request(creator, { amountMinor: 10_000 })).rejects.toThrow(/registered name changed/);
    expect((await repos.payoutMethods.current(creator.userId))!.status).toBe("needs_recheck");
    expect(monimeServer.payouts.size).toBe(0);
  });

  it("an unknown Monime outcome keeps the payout requested and a retry reuses the same key", async () => {
    await readyToWithdraw();
    monimeServer.failNext(503, "internal_error", "timeout", "/payouts");
    const payout = await payouts.request(creator, { amountMinor: 10_000 });
    expect(payout.status).toBe("requested");
    await expect(payouts.request(creator, { amountMinor: 10_000 })).rejects.toThrow(/already have a withdrawal/);
    const retried = await payouts.dispatch(payout.id);
    expect(retried.status).toBe("processing");
    const keys = monimeServer.requests.filter((r) => r.path === "/payouts").map((r) => r.idempotencyKey);
    expect(new Set(keys)).toEqual(new Set([`payout-${payout.id}`]));
  });

  it("a definitive Monime rejection marks the payout failed", async () => {
    await readyToWithdraw();
    monimeServer.failNext(400, "validation_error", "bad destination", "/payouts");
    expect((await payouts.request(creator, { amountMinor: 10_000 })).status).toBe("failed");
  });

  it("large withdrawals wait for staff release", async () => {
    await readyToWithdraw(300_000);
    const payout = await payouts.request(creator, { amountMinor: 150_000 });
    expect(payout).toMatchObject({ status: "in_review", reviewReason: "above_auto_approve" });
    expect(monimeServer.payouts.size).toBe(0);
    await expect(payouts.release(creator, payout.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await payouts.release(staff, payout.id)).payout.status).toBe("processing");
  });

  it("fails closed when the live balance can't be read", async () => {
    await readyToWithdraw();
    monimeServer.failNext(503, "internal_error", "down", "/financial-accounts/");
    expect(await balances.getBalance(creator.userId)).toMatchObject({ availableMinor: null, stale: true, maxWithdrawableMinor: 0, displayMinor: 50_000 });

    monimeServer.failNext(503, "internal_error", "down", "/financial-accounts/");
    await expect(payouts.request(creator, { amountMinor: 10_000 })).rejects.toThrow(/couldn't confirm your balance/);
    expect(monimeServer.payouts.size).toBe(0);

    monimeServer.failNext(503, "internal_error", "down", "/provider-kyc/");
    await expect(payouts.request(creator, { amountMinor: 10_000 })).rejects.toThrow(/couldn't check this number/);
  });

  it("a final withdrawal empties a balance under the minimum, but only for the full amount", async () => {
    await readyToWithdraw(3_000); // Le 30, under the Le 50 minimum
    const { maxWithdrawableMinor: max } = await balances.getBalance(creator.userId);
    expect(max).toBe(2_971); // 2971 + 1% fee (29) = 3000

    await expect(payouts.request(creator, { amountMinor: max })).rejects.toMatchObject({ fieldErrors: { amount: [expect.stringMatching(/minimum/)] } });
    await expect(payouts.request(creator, { amountMinor: 1_000, final: true })).rejects.toMatchObject({
      fieldErrors: { amount: [expect.stringMatching(/sends everything/)] },
    });
    const payout = await payouts.request(creator, { amountMinor: max, final: true });
    expect(payout.amountMinor).toBe(max);
  });
});

describe("withdrawal races", () => {
  const payoutCalls = () => monimeServer.requests.filter((r) => r.path === "/payouts").length;

  it("a dispatch while another is in flight doesn't call Monime again", async () => {
    await readyToWithdraw();
    monimeServer.failNext(503, "internal_error", "timeout", "/payouts");
    const payout = await payouts.request(creator, { amountMinor: 10_000 });
    expect(payout.status).toBe("requested");
    expect(await repos.payouts.claimDispatch(payout.id)).not.toBeNull(); // dispatcher A is sending it
    const before = payoutCalls();
    expect((await payouts.dispatch(payout.id)).status).toBe("requested"); // B (cron, staff) backs off
    expect(payoutCalls()).toBe(before);
  });

  it("a 409 from Monime is an unknown outcome: the payout stays requested", async () => {
    await readyToWithdraw();
    monimeServer.failNext(409, "idempotency_conflict", "key in use", "/payouts");
    const payout = await payouts.request(creator, { amountMinor: 10_000 });
    expect(payout.status).toBe("requested");
    expect((await payouts.dispatch(payout.id)).status).toBe("processing");
  });

  it("a released payout isn't sent to a number flagged while it waited for review", async () => {
    await readyToWithdraw(300_000);
    const payout = await payouts.request(creator, { amountMinor: 150_000 });
    await t.client.query("update payout_methods set status = 'needs_recheck' where id = $1", [payout.payoutMethodId]);
    expect((await payouts.release(staff, payout.id)).payout).toMatchObject({ status: "failed", failureCode: "destination_unavailable" });
    expect(payoutCalls()).toBe(0);
  });

  it("re-checks the balance under the wallet lock (a stale reading can't overdraw)", async () => {
    await readyToWithdraw(10_000);
    // The balance read before the lock is out of date (another payout completed since).
    const stale = new PayoutService({
      repos,
      monime: monimeServer.client(),
      balances: { getBalance: async () => ({ displayMinor: 100_000, availableMinor: 100_000, maxWithdrawableMinor: 95_000, pendingMinor: 0, payoutFeeBps: 0, stale: false }) },
      methods,
      kyc,
      settings: new PlatformSettingsService(repos.settings),
      email: { send: async () => {} },
      appBaseUrl: "https://dumegud.test",
      now: () => now,
    });
    await expect(stale.request(creator, { amountMinor: 50_000 })).rejects.toThrow(/balance changed/);
    expect(await repos.payouts.findOpenForCreator(creator.userId)).toBeNull();
  });

  it("refuses a withdrawal once a deletion request has committed", async () => {
    await readyToWithdraw();
    await repos.accountDeletions.insert({ userId: creator.userId, requestedAt: now, eraseAfter: new Date(now.getTime() + 86_400_000), forfeitedMinor: 0 });
    await expect(payouts.request(creator, { amountMinor: 10_000 })).rejects.toThrow(/scheduled for deletion/);
  });
});
