import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { creatorMilestones, payments } from "@/server/db/schema";
import type { EmailMessage, EmailService } from "@/server/integrations/email";
import { FakeMonimeServer, type WebhookEnvelope } from "@/server/integrations/monime/fake";
import { parseMonimeEvent } from "@/server/integrations/monime/webhook";
import { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import { EngagementRepository } from "@/server/repositories/EngagementRepository";
import { LedgerRepository } from "@/server/repositories/LedgerRepository";
import { PaymentRepository } from "@/server/repositories/PaymentRepository";
import { PlatformSettingsRepository } from "@/server/repositories/PlatformSettingsRepository";
import { ShoutoutRepository } from "@/server/repositories/ShoutoutRepository";
import { UserRepository } from "@/server/repositories/UserRepository";
import { WebhookEventRepository } from "@/server/repositories/WebhookEventRepository";
import type { Actor } from "@/server/services/actor";
import { ContributionService } from "@/server/services/ContributionService";
import { CELEBRATE_WITHIN_MS, MilestoneService } from "@/server/services/MilestoneService";
import { PlatformSettingsService } from "@/server/services/PlatformSettingsService";
import { RecapService } from "@/server/services/RecapService";
import { SettlementService } from "@/server/services/SettlementService";
import { TransferService } from "@/server/services/TransferService";
import { WalletService } from "@/server/services/WalletService";
import { WebhookService } from "@/server/services/WebhookService";
import { startSupportSchema } from "@/server/validation/support";
import { createTestDb, type TestDb } from "./db";

// Recaps and milestones on real SQL: who counts as a supporter, what a month adds up to, and that
// overlapping webhooks, sweeps and job runs write each row and send each email exactly once.

let t: TestDb;
let now: Date;
let creatorId: string;
let actor: Actor;
let sent: EmailMessage[];
let failNext: boolean;

const repos = {
  users: new UserRepository(),
  profiles: new CreatorProfileRepository(),
  wallets: new CreatorWalletRepository(),
  payments: new PaymentRepository(),
  ledger: new LedgerRepository(),
  settings: new PlatformSettingsRepository(),
  webhookEvents: new WebhookEventRepository(),
  engagement: new EngagementRepository(),
  shoutouts: new ShoutoutRepository(),
};

const email: EmailService = {
  async send(message) {
    if (failNext) {
      failNext = false;
      throw new Error("smtp down");
    }
    sent.push(message);
  },
};

let recaps: RecapService;
let milestones: MilestoneService;
let seq = 0;

const ctx = (at = now, budget = Infinity) => {
  let left = budget;
  return { now: at, hasTime: () => left-- > 0 };
};

/** A settled payment, written straight to the table (the queries only read `payments`). */
async function paid(o: { at: string | Date; netMinor?: number; payer?: string | null; kind?: "contribution" | "order"; status?: "succeeded" | "failed" | "under_review"; source?: "tiktok" | "whatsapp" | null }) {
  const [row] = await t.db
    .insert(payments)
    .values({
      kind: o.kind ?? "contribution",
      creatorId,
      status: o.status ?? "succeeded",
      grossMinor: (o.netMinor ?? 5_000) + 500,
      creatorNetMinor: o.netMinor ?? 5_000,
      platformFeeBps: 500,
      payerFingerprintHash: o.payer === undefined ? `payer-${++seq}` : o.payer,
      idempotencyKey: `k-${++seq}`,
      trafficSource: o.source ?? null,
      settledAt: new Date(o.at),
    })
    .returning();
  return row;
}

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

beforeEach(async () => {
  await t.client.exec(
    "truncate creator_milestones, creator_recaps, ledger_entries, ledger_journals, payment_events, contributions, payments, webhook_events, creator_wallets, creator_profiles, users cascade",
  );
  now = new Date("2026-10-01T09:00:00Z");
  sent = [];
  failNext = false;
  const user = (await repos.users.insertIfEmailFree({ email: "aminata@example.com", name: "Aminata Kamara", passwordHash: null }))!;
  creatorId = user.id;
  actor = { userId: user.id, status: "active", emailVerified: true } as Actor;
  await repos.profiles.insert(user.id, { handle: "aminata", handleLower: "aminata", displayName: "Aminata", bio: "", categoryId: null, supportMessageEnabled: true });
  await repos.profiles.setStatusOwned(user.id, "published", new Date("2026-08-01T00:00:00Z"));
  recaps = new RecapService({ repos, email, appBaseUrl: "https://dumegud.test", now: () => now });
  milestones = new MilestoneService({ repos, email, appBaseUrl: "https://dumegud.test", now: () => now });
});

describe("monthly recap", () => {
  it("counts distinct and new supporters, net received and sales; ignores unsettled payments", async () => {
    await paid({ at: "2026-08-10T10:00:00Z", payer: "returning", netMinor: 1_000 });
    await paid({ at: "2026-09-02T10:00:00Z", payer: "returning", netMinor: 2_000, source: "tiktok" });
    await paid({ at: "2026-09-03T10:00:00Z", payer: "returning", netMinor: 2_000, source: "tiktok" });
    await paid({ at: "2026-09-04T10:00:00Z", payer: "new-one", netMinor: 3_000, source: "whatsapp" });
    await paid({ at: "2026-09-05T10:00:00Z", payer: null, netMinor: 1_000 }); // no fingerprint: its own supporter
    await paid({ at: "2026-09-06T10:00:00Z", kind: "order", netMinor: 10_000, payer: "buyer", source: "tiktok" });
    await paid({ at: "2026-09-07T10:00:00Z", status: "failed", netMinor: 99_000 });
    await paid({ at: "2026-09-08T10:00:00Z", status: "under_review", netMinor: 99_000 });
    await paid({ at: "2026-10-01T00:10:00Z", netMinor: 50_000 }); // next month

    const recap = (await recaps.get(actor, "2026-09"))!;
    expect(recap.stats).toEqual({
      month: "2026-09",
      supporters: 3,
      newSupporters: 2,
      gifts: 4,
      productsSold: 1,
      giftsNetMinor: 8_000,
      salesNetMinor: 10_000,
      receivedNetMinor: 18_000,
      topSource: "tiktok",
      bestMonth: true, // August had Le 10
    });
  });

  it("never calls a first month the best, and a month with nothing in it has no recap", async () => {
    await paid({ at: "2026-09-02T10:00:00Z" });
    expect((await recaps.get(actor, "2026-09"))!.stats.bestMonth).toBe(false);
    expect(await recaps.get(actor, "2026-08")).toBeNull();
  });

  it("doesn't freeze a month until an hour after it ends, then Home says quiet or shows the recap", async () => {
    now = new Date("2026-10-01T00:30:00Z");
    await paid({ at: "2026-09-30T23:59:59Z" });
    expect(await recaps.get(actor, "2026-09")).toBeNull();
    expect(await recaps.home(actor)).toBeNull(); // not built yet, so not "quiet" either

    now = new Date("2026-10-01T01:30:00Z");
    const home = await recaps.home(actor);
    expect(home?.kind).toBe("recap");
    await recaps.markSeen(actor, home!.kind === "recap" ? home!.recap.id : "");
    expect(await recaps.home(actor)).toBeNull();

    now = new Date("2026-11-02T09:00:00Z"); // October was quiet
    expect(await recaps.home(actor)).toEqual({ kind: "quiet", month: "2026-10" });
    now = new Date("2026-11-11T09:00:00Z");
    expect(await recaps.home(actor)).toBeNull();
  });

  it("concurrent builds and overlapping job runs make one recap and send one email", async () => {
    await paid({ at: "2026-09-02T10:00:00Z" });
    const [a, b] = await Promise.all([recaps.get(actor, "2026-09"), recaps.get(actor, "2026-09")]);
    expect(a!.id).toBe(b!.id);

    const runs = await Promise.all([recaps.sendMonthlyRecaps(ctx()), recaps.sendMonthlyRecaps(ctx())]);
    expect(runs.reduce((n, r) => n + r.errors, 0)).toBe(0);
    expect(sent.filter((m) => m.tag === "monthly-recap")).toHaveLength(1);
    await recaps.sendMonthlyRecaps(ctx());
    expect(sent).toHaveLength(1);
  });

  it("retries an email that failed, and respects the opt-out", async () => {
    await paid({ at: "2026-09-02T10:00:00Z" });
    failNext = true;
    expect((await recaps.sendMonthlyRecaps(ctx())).errors).toBe(1);
    expect(sent).toHaveLength(0);
    await recaps.sendMonthlyRecaps(ctx());
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Your September on DuMeGud");

    await t.client.exec("truncate creator_recaps");
    sent = [];
    await repos.profiles.setEmailPreferencesOwned(creatorId, { recapEmails: false, milestoneEmails: true });
    await recaps.sendMonthlyRecaps(ctx());
    expect(sent).toHaveLength(0);
    expect(await recaps.get(actor, "2026-09")).not.toBeNull(); // still built for the dashboard
  });
});

describe("milestones", () => {
  it("records the real crossing payment and celebrates only fresh ones", async () => {
    const first = await paid({ at: "2026-09-01T10:00:00Z", netMinor: 4_000 }); // long ago: silent
    for (let i = 0; i < 7; i++) await paid({ at: `2026-09-1${i}T10:00:00Z`, netMinor: 1_000 });
    await paid({ at: "2026-09-20T10:00:00Z", payer: "payer-again", netMinor: 1_000 });
    await paid({ at: "2026-09-21T10:00:00Z", payer: "payer-again", netMinor: 1_000 }); // same person
    const tenth = await paid({ at: new Date(now.getTime() - 60_000), netMinor: 1_000 });

    await milestones.checkAfterPayment({ creatorId });
    const rows = await repos.engagement.listMilestones(creatorId);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(Object.keys(byKey).sort()).toEqual(["first_supporter", "received_100", "supporters_10"]);
    expect(byKey.first_supporter).toMatchObject({ paymentId: first.id, silent: true });
    expect(byKey.received_100.silent).toBe(true); // crossed back in September
    expect(byKey.supporters_10).toMatchObject({ paymentId: tenth.id, silent: false });
    expect(sent.map((m) => m.subject)).toEqual(["10 people support you now"]);

    expect((await milestones.latestUnseen(actor))?.key).toBe("supporters_10");
    await milestones.markSeen(actor);
    expect(await milestones.latestUnseen(actor)).toBeNull();
  });

  it("parallel webhooks and the sweep write each milestone once and send one email", async () => {
    await paid({ at: new Date(now.getTime() - 1_000), kind: "order" });
    await Promise.all([
      milestones.checkAfterPayment({ creatorId }),
      milestones.checkAfterPayment({ creatorId }),
      milestones.sweep(ctx()),
    ]);
    const rows = await t.db.select().from(creatorMilestones);
    expect(rows.map((r) => r.key).sort()).toEqual(["first_sale"]);
    expect(sent).toHaveLength(1);
    await milestones.sweep(ctx());
    expect(sent).toHaveLength(1);
  });

  it("the sweep backfills silently, adds the one-year milestone, and retries a failed email", async () => {
    await paid({ at: "2025-01-05T10:00:00Z" });
    await t.client.query("update creator_profiles set created_at = $1", ["2025-09-30T08:00:00Z"]);
    await milestones.sweep(ctx());
    const rows = await repos.engagement.listMilestones(creatorId);
    expect(rows.map((r) => [r.key, r.silent])).toEqual([
      ["first_supporter", true],
      ["one_year", false],
    ]);
    expect(rows[1].achievedAt.toISOString()).toBe("2026-09-30T08:00:00.000Z");
    expect(sent.map((m) => m.tag)).toEqual(["milestone"]);

    await paid({ at: new Date(now.getTime() - CELEBRATE_WITHIN_MS / 2), kind: "order", netMinor: 1_000 }); // under Le 100 in total
    failNext = true;
    await milestones.checkAfterPayment({ creatorId }); // email fails, claim is released
    expect(sent).toHaveLength(1);
    await milestones.sweep(ctx());
    expect(sent.map((m) => m.subject)).toEqual(["One year on DuMeGud", "You made your first sale"]);
  });

  it("stops when the run's time is up and the next run carries on", async () => {
    await paid({ at: new Date(now.getTime() - 1_000) });
    const r = await milestones.sweep(ctx(now, 0));
    expect(r.processed).toBe(0);
    expect(await repos.engagement.listMilestones(creatorId)).toHaveLength(0);
    await milestones.sweep(ctx());
    expect(await repos.engagement.listMilestones(creatorId)).toHaveLength(1);
  });

  it("a real settlement webhook raises the first-supporter milestone", async () => {
    await t.client.exec(readFileSync("server/db/migrations/0005_seed_platform_settings.sql", "utf8"));
    now = new Date();
    const monimeServer = new FakeMonimeServer();
    const monime = monimeServer.client();
    const platformId = monimeServer.seedAccount({ id: "fac-platform" }).id;
    const settings = new PlatformSettingsService(repos.settings);
    const transfers = new TransferService({ repos, monime, platformAccountId: () => platformId, sleep: async () => {} });
    const settlement = new SettlementService({ repos, transfers, settings, monime, milestones, now: () => now });
    const contributions = new ContributionService({
      repos,
      monime,
      settings,
      platformAccountId: () => platformId,
      appBaseUrl: "https://dumegud.test",
      rateLimit: async () => {},
      now: () => now,
    });
    const webhooks = new WebhookService(repos.webhookEvents, settlement.webhookHandlers());
    await new WalletService(repos, monime).provisionForCreator(creatorId);

    const input = startSupportSchema.parse({ handle: "aminata", amount: "300", supporterName: "", message: "", isAnonymous: false, socialPlatform: "", socialHandle: "" });
    const started = await contributions.start(input, { ip: "203.0.113.1", userAgent: "vitest" });
    const payment = (await repos.payments.findById(started.paymentId))!;
    const events = monimeServer.completeCheckout(payment.monimeCheckoutSessionId!);
    for (const e of [...events, ...events]) await webhooks.handleMonime(parseMonimeEvent(JSON.stringify(e as WebhookEnvelope))!, e);

    const rows = await repos.engagement.listMilestones(creatorId);
    expect(rows.map((r) => r.key)).toContain("first_supporter");
    expect(rows.find((r) => r.key === "first_supporter")).toMatchObject({ paymentId: payment.id, silent: false });
    expect(sent.filter((m) => m.subject === "You have your first supporter")).toHaveLength(1);
  });
});
