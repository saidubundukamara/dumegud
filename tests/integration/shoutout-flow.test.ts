import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeMonimeServer, type WebhookEnvelope } from "@/server/integrations/monime/fake";
import { parseMonimeEvent } from "@/server/integrations/monime/webhook";
import { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import { LedgerRepository } from "@/server/repositories/LedgerRepository";
import { PaymentRepository } from "@/server/repositories/PaymentRepository";
import { PlatformSettingsRepository } from "@/server/repositories/PlatformSettingsRepository";
import { ShoutoutRepository } from "@/server/repositories/ShoutoutRepository";
import { UserRepository } from "@/server/repositories/UserRepository";
import { WebhookEventRepository } from "@/server/repositories/WebhookEventRepository";
import type { Actor } from "@/server/services/actor";
import { ContributionService } from "@/server/services/ContributionService";
import { PlatformSettingsService } from "@/server/services/PlatformSettingsService";
import { SettlementService } from "@/server/services/SettlementService";
import { ShoutoutService, type ShoutoutOptions } from "@/server/services/ShoutoutService";
import { TransferService } from "@/server/services/TransferService";
import { WalletService } from "@/server/services/WalletService";
import { WebhookService } from "@/server/services/WebhookService";
import { startSupportSchema, type StartSupportInput } from "@/server/validation/support";
import { createTestDb, type TestDb } from "./db";

// Shout-outs end to end on real SQL: handle + consent captured at checkout (or added afterwards
// with the claim cookie), only paid + consenting supporters appear, posting clears the waiting list.

let t: TestDb;
let monimeServer: FakeMonimeServer;
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
let webhooks: WebhookService;
let shoutouts: ShoutoutService;
let actor: Actor;
let ip = 0;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

beforeEach(async () => {
  await t.client.exec(
    "truncate shoutouts, ledger_entries, ledger_journals, payment_events, contributions, payments, webhook_events, creator_wallets, creator_profiles, users cascade",
  );
  await t.client.exec(readFileSync("server/db/migrations/0005_seed_platform_settings.sql", "utf8"));
  now = new Date();
  monimeServer = new FakeMonimeServer();
  const monime = monimeServer.client();
  const platformId = monimeServer.seedAccount({ id: "fac-platform" }).id;
  const settings = new PlatformSettingsService(repos.settings);
  const transfers = new TransferService({ repos, monime, platformAccountId: () => platformId, sleep: async () => {} });
  const settlement = new SettlementService({ repos, transfers, settings, monime, now: () => now });
  contributions = new ContributionService({
    repos,
    monime,
    settings,
    platformAccountId: () => platformId,
    appBaseUrl: "https://dumegud.test",
    rateLimit: async () => {},
    now: () => now,
  });
  webhooks = new WebhookService(repos.webhookEvents, settlement.webhookHandlers());
  shoutouts = new ShoutoutService({ repos, appBaseUrl: "https://dumegud.test", now: () => now });

  const user = (await repos.users.insertIfEmailFree({ email: "aminata@example.com", name: "Aminata", passwordHash: null }))!;
  actor = { userId: user.id, role: "creator", status: "active", emailVerified: true } as Actor;
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

/** Parse like the widget's action does, then pay and settle through the fake Monime. */
async function support(form: Record<string, unknown>, pay = true) {
  const input: StartSupportInput = startSupportSchema.parse({
    handle: "aminata",
    amount: "300",
    supporterName: "",
    message: "",
    isAnonymous: false,
    socialPlatform: "",
    socialHandle: "",
    ...form,
  });
  // A different IP each time, so the 60s checkout de-duplication doesn't merge supporters.
  const started = await contributions.start(input, { ...ctx, ip: `203.0.113.${++ip}` });
  if (pay) {
    const payment = (await repos.payments.findById(started.paymentId))!;
    for (const e of monimeServer.completeCheckout(payment.monimeCheckoutSessionId!)) {
      await webhooks.handleMonime(parseMonimeEvent(JSON.stringify(e as WebhookEnvelope))!, e);
    }
  }
  return started;
}

const options = (o: Partial<ShoutoutOptions> = {}): ShoutoutOptions => ({
  period: "since_last",
  platform: "tiktok",
  style: "warm",
  includeTop: false,
  exclude: [],
  ...o,
});

describe("shout-outs", () => {
  it("records source, handle and consent; anonymous or unticked supporters are never named", async () => {
    const named = await support({ supporterName: "Kadiatu", socialPlatform: "tiktok", socialHandle: "@Kadi.SL", shoutoutConsent: true, source: "tiktok" });
    await support({ supporterName: "Ghost", socialPlatform: "tiktok", socialHandle: "ghost", shoutoutConsent: true, isAnonymous: true });
    await support({ supporterName: "Private", socialPlatform: "tiktok", socialHandle: "private", shoutoutConsent: false });
    await support({ socialPlatform: "tiktok", socialHandle: "unpaid", shoutoutConsent: true }, false);

    const payment = (await repos.payments.findById(named.paymentId))!;
    expect(payment.trafficSource).toBe("tiktok");
    const row = (await repos.shoutouts.findContributionByPaymentId(named.paymentId))!;
    expect(row).toMatchObject({ socialPlatform: "tiktok", socialHandle: "kadi.sl", shoutoutConsent: true });
    expect(row.shoutoutConsentAt).toBeInstanceOf(Date);

    const { rows } = await t.client.query<{ social_handle: string | null }>(
      "select social_handle from contributions where social_handle in ('ghost', 'private')",
    );
    expect(rows).toEqual([]); // not kept without consent

    const preview = await shoutouts.preview(actor, options());
    expect(preview.people.map((p) => p.mention)).toEqual(["@kadi.sl"]);
    expect(preview.caption).toContain("@kadi.sl");
    expect(preview.caption).toContain("dumegud.test/aminata?via=tiktok");
    expect(await shoutouts.waitingCount(actor)).toBe(1);
    expect(await contributions.recentSupporters(actor.userId)).toEqual(
      expect.arrayContaining([{ name: "Kadiatu", platform: "tiktok", handle: "kadi.sl" }, { name: "Private", platform: null, handle: null }]),
    );
  });

  it("lets only the paying browser add a handle after checkout, once", async () => {
    const started = await support({ supporterName: "Isatu" }, false);
    expect(started.claim).toMatch(new RegExp(`^${started.paymentId}\\.`));
    const add = (claim: string | undefined, handle = "isatu_sl") =>
      contributions.addShoutout({ paymentId: started.paymentId, socialPlatform: "instagram", socialHandle: handle }, claim, ctx);

    // Not paid yet → refused.
    expect(await contributions.canAddShoutout(started.paymentId, started.claim!)).toBe(false);
    expect(await contributions.paidAmountForClaim(started.paymentId, started.claim!)).toBeNull();
    const payment = (await repos.payments.findById(started.paymentId))!;
    for (const e of monimeServer.completeCheckout(payment.monimeCheckoutSessionId!)) {
      await webhooks.handleMonime(parseMonimeEvent(JSON.stringify(e))!, e);
    }

    await expect(add(undefined)).rejects.toThrow(/expired/);
    await expect(add(`${started.paymentId}.wrong-secret`)).rejects.toThrow(/expired/);
    expect(await contributions.canAddShoutout(started.paymentId, started.claim!)).toBe(true);
    // The thank-you amount is for the paying browser only.
    expect(await contributions.paidAmountForClaim(started.paymentId, started.claim!)).toBe(payment.grossMinor);
    expect(await contributions.paidAmountForClaim(started.paymentId, `${started.paymentId}.wrong-secret`)).toBeNull();
    expect(await contributions.paidAmountForClaim(started.paymentId, undefined)).toBeNull();
    expect((await add(started.claim!)).tags).toHaveLength(1);
    // Still theirs after adding a handle (the shout-out form closes, the thank-you stays).
    expect(await contributions.paidAmountForClaim(started.paymentId, started.claim!)).toBe(payment.grossMinor);
    await expect(add(started.claim!, "someone_else")).rejects.toThrow(/expired/);

    const row = (await repos.shoutouts.findContributionByPaymentId(started.paymentId))!;
    expect(row).toMatchObject({ socialPlatform: "instagram", socialHandle: "isatu_sl", shoutoutConsent: true });

    // A day later the claim has lapsed.
    const other = await support({ supporterName: "Late" });
    now = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    expect(await contributions.canAddShoutout(other.paymentId, other.claim!)).toBe(false);
  });

  it("ranks top supporters, honours 'leave out', and posting clears the waiting list", async () => {
    const a = await support({ supporterName: "Kadiatu", socialPlatform: "tiktok", socialHandle: "kadi", shoutoutConsent: true });
    await support({ supporterName: "Mohamed", socialPlatform: "instagram", socialHandle: "mo_sl", shoutoutConsent: true, amount: "450" });
    const spam = await support({ socialPlatform: "tiktok", socialHandle: "buy_followers", shoutoutConsent: true });

    const spamId = (await repos.shoutouts.findContributionByPaymentId(spam.paymentId))!.id;
    const preview = await shoutouts.preview(actor, options({ includeTop: true, exclude: [spamId] }));
    expect(preview.people.filter((p) => !p.excluded).map((p) => p.mention)).toEqual(["@kadi", "Mohamed"]);
    expect(preview.top.map((p) => p.name)).toEqual(["Mohamed", "Kadiatu"]);
    expect(preview.caption).not.toContain("buy_followers");

    const reviewed = preview.people.map((p) => p.contributionId);
    expect(await shoutouts.markPosted(actor, { ...options({ includeTop: true, exclude: [spamId] }), reviewed })).toEqual({ thanked: 3 });
    expect(await shoutouts.waitingCount(actor)).toBe(0);
    expect((await shoutouts.preview(actor, options())).people).toEqual([]);
    // "Past 7 days" still lists them, marked as thanked.
    expect((await shoutouts.preview(actor, options({ period: "week" }))).people.every((p) => p.thanked)).toBe(true);

    // Someone else's ids are never touched.
    const stranger = { ...actor, userId: "00000000-0000-4000-8000-000000000000" };
    const aId = (await repos.shoutouts.findContributionByPaymentId(a.paymentId))!.id;
    expect(await shoutouts.markPosted(stranger, { ...options({ period: "week" }), reviewed: [aId] })).toEqual({ thanked: 0 });
  });

  it("totals succeeded payments per traffic source", async () => {
    await support({ source: "tiktok" });
    await support({ source: "tiktok" });
    await support({ source: "whatsapp" });
    await support({ source: "nonsense" });
    const totals = await shoutouts.sourceTotals(actor);
    expect(totals.find((r) => r.source === "tiktok")).toMatchObject({ payments: 2, grossMinor: 60_000 });
    expect(totals.find((r) => r.source === "whatsapp")).toMatchObject({ payments: 1 });
    expect(totals.find((r) => r.source === null)).toMatchObject({ payments: 1 });
  });
});
