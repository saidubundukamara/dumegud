import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeMonimeServer } from "@/server/integrations/monime/fake";
import { parseMonimeEvent } from "@/server/integrations/monime/webhook";
import { AdminRepository } from "@/server/repositories/AdminRepository";
import { AuditRepository } from "@/server/repositories/AuditRepository";
import { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import { KycRepository } from "@/server/repositories/KycRepository";
import { LedgerRepository } from "@/server/repositories/LedgerRepository";
import { PaymentRepository } from "@/server/repositories/PaymentRepository";
import { ShoutoutRepository } from "@/server/repositories/ShoutoutRepository";
import { PayoutMethodRepository } from "@/server/repositories/PayoutMethodRepository";
import { AccountDeletionRepository } from "@/server/repositories/AccountDeletionRepository";
import { PayoutRepository } from "@/server/repositories/PayoutRepository";
import { PlatformSettingsRepository } from "@/server/repositories/PlatformSettingsRepository";
import { RiskRepository } from "@/server/repositories/RiskRepository";
import { UserRepository } from "@/server/repositories/UserRepository";
import { WebhookEventRepository } from "@/server/repositories/WebhookEventRepository";
import type { Actor } from "@/server/services/actor";
import { AdminService } from "@/server/services/AdminService";
import { AuditService } from "@/server/services/compliance";
import { ContributionService } from "@/server/services/ContributionService";
import { LimitService } from "@/server/services/LimitService";
import { PayoutService } from "@/server/services/PayoutService";
import { PlatformSettingsService } from "@/server/services/PlatformSettingsService";
import { RiskService } from "@/server/services/RiskService";
import { SettlementService } from "@/server/services/SettlementService";
import { TransferService } from "@/server/services/TransferService";
import { WalletService } from "@/server/services/WalletService";
import { WebhookService } from "@/server/services/WebhookService";
import { createTestDb, type TestDb } from "./db";

let t: TestDb;
let monimeServer: FakeMonimeServer;
let creator: Actor;
let staff: Actor;
let staff2: Actor;
let superAdmin: Actor;

const repos = {
  users: new UserRepository(),
  profiles: new CreatorProfileRepository(),
  wallets: new CreatorWalletRepository(),
  payments: new PaymentRepository(),
  shoutouts: new ShoutoutRepository(),
  ledger: new LedgerRepository(),
  settings: new PlatformSettingsRepository(),
  webhookEvents: new WebhookEventRepository(),
  audit: new AuditRepository(),
  risk: new RiskRepository(),
  admin: new AdminRepository(),
  kyc: new KycRepository(),
  payoutMethods: new PayoutMethodRepository(),
  payouts: new PayoutRepository(),
  accountDeletions: new AccountDeletionRepository(),
};

let admin: AdminService;
let contributions: ContributionService;
let webhooks: WebhookService;
let payoutService: PayoutService;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

async function user(email: string, role: Actor["role"]): Promise<Actor> {
  const u = (await repos.users.insertIfEmailFree({ email, name: email, passwordHash: null }))!;
  if (role !== "creator") await t.db.execute(sql`update users set role = ${role} where id = ${u.id}`);
  return { userId: u.id, role, status: "active", emailVerified: true };
}

beforeEach(async () => {
  await t.client.exec(
    `truncate payouts, payout_methods, kyc_submissions, risk_alerts, risk_cases, account_restrictions, ledger_entries, ledger_journals,
     payment_events, contributions, payments, webhook_events, creator_wallets, creator_profiles, transaction_limits, risk_rules, users cascade`,
  );
  for (const f of ["0005_seed_platform_settings.sql", "0007_seed_product_settings.sql", "0009_seed_payout_settings.sql", "0011_append_only_and_seed_risk.sql", "0013_seed_admin_settings.sql"]) {
    for (const stmt of readFileSync(`server/db/migrations/${f}`, "utf8").split("--> statement-breakpoint")) {
      if (!/CREATE (OR REPLACE FUNCTION|TRIGGER)/.test(stmt) && stmt.trim()) await t.client.exec(stmt);
    }
  }
  monimeServer = new FakeMonimeServer();
  const monime = monimeServer.client();
  const platformId = monimeServer.seedAccount({ id: "fac-platform" }).id;
  const settings = new PlatformSettingsService(repos.settings);
  const audit = new AuditService(repos.audit);
  const limits = new LimitService(repos.risk);
  const risk = new RiskService(repos);
  const transfers = new TransferService({ repos, monime, platformAccountId: () => platformId, sleep: async () => {} });
  const settlement = new SettlementService({ repos, transfers, settings, monime, limits, risk });
  contributions = new ContributionService({ repos, monime, settings, platformAccountId: () => platformId, appBaseUrl: "https://dumegud.test", rateLimit: async () => {}, limits, risk });
  payoutService = new PayoutService({
    repos,
    monime,
    settings,
    audit,
    balances: { getBalance: async () => ({ displayMinor: 0, availableMinor: 0, maxWithdrawableMinor: 0, pendingMinor: 0, payoutFeeBps: 100, stale: false }) },
    methods: { current: async () => null, assertHolderUnchanged: async () => {} },
    kyc: { approvedLegalName: async () => null },
    email: { send: async () => {} },
    appBaseUrl: "https://dumegud.test",
  });
  webhooks = new WebhookService(repos.webhookEvents, settlement.webhookHandlers());
  admin = new AdminService({ repos, audit, monime, platformAccountId: () => platformId, settlement, transfers, payouts: payoutService, webhooks: () => webhooks });

  creator = await user("aminata@example.com", "creator");
  await new WalletService(repos, monime).provisionForCreator(creator.userId);
  await repos.profiles.insert(creator.userId, { handle: "aminata", handleLower: "aminata", displayName: "Aminata", bio: "", categoryId: null, supportMessageEnabled: true });
  await repos.profiles.setStatusOwned(creator.userId, "published", new Date());
  staff = await user("staff1@dumegud.test", "staff");
  staff2 = await user("staff2@dumegud.test", "staff");
  superAdmin = await user("root@dumegud.test", "super_admin");
});

async function pay(amount: number, fingerprint: string) {
  const { paymentId } = await contributions.start({ handle: "aminata", amount, supporterName: null, message: null, isAnonymous: true }, { ip: `198.51.100.${Math.floor(Math.random() * 200)}`, userAgent: null });
  const p = (await repos.payments.findById(paymentId))!;
  const events = monimeServer.completeCheckout(p.monimeCheckoutSessionId!, { fingerprint });
  for (const e of events) await webhooks.handleMonime(parseMonimeEvent(JSON.stringify(e))!, e);
  return { paymentId, events };
}

describe("payments", () => {
  it("releasing a held payment transfers it, and a webhook replay doesn't hold it again", async () => {
    await pay(50_000, "big");
    await pay(50_000, "big");
    const { paymentId, events } = await pay(10_000, "big"); // over the 100,000 supporter→creator review limit
    expect((await repos.payments.findById(paymentId))!.status).toBe("under_review");

    await expect(admin.releasePaymentReview(staff, paymentId, "")).rejects.toMatchObject({ code: "VALIDATION" });
    await admin.releasePaymentReview(staff, paymentId, "Known supporter, confirmed by phone");
    expect(await repos.payments.findById(paymentId)).toMatchObject({ status: "succeeded", transferStatus: "completed" });

    // A late duplicate of the payment event (new event id) must not re-hold it.
    const replay = { ...events[1], event: { ...events[1].event, id: "wkd-late-duplicate" } };
    await webhooks.handleMonime(parseMonimeEvent(JSON.stringify(replay))!, replay);
    expect((await repos.payments.findById(paymentId))!.status).toBe("succeeded");

    const detail = await admin.paymentDetail(staff, paymentId);
    expect(detail.events.map((e) => e.toStatus)).toEqual(expect.arrayContaining(["under_review", "succeeded"]));
    expect((await repos.audit.listForTarget("payment", paymentId))[0].action).toBe("payment.release_review");
  });
});

describe("payouts", () => {
  it("large payouts need two different staff approvals", async () => {
    const methodId = crypto.randomUUID();
    await t.client.query(
      `insert into payout_methods (id, user_id, provider_id, msisdn_enc, msisdn_hash, msisdn_last3, holder_name, name_match, status, bound_at)
       values ($1, $2, 'm17', 'x', 'h', '456', 'A', 'match', 'active', now())`,
      [methodId, creator.userId],
    );
    const id = crypto.randomUUID();
    await repos.payouts.insert({
      id,
      creatorId: creator.userId,
      payoutMethodId: methodId,
      amountMinor: 600_000,
      quotedFeeMinor: 6_000,
      status: "in_review",
      idempotencyKey: `payout-${id}`,
      destinationSnapshot: {},
    });
    expect((await payoutService.release(staff, id)).released).toBe(false);
    await expect(payoutService.release(staff, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const second = await payoutService.release(staff2, id);
    expect(second.released).toBe(true);
    const actions = (await repos.audit.listForTarget("payout", id)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["payout.approve_first", "payout.release"]));
  });
});

describe("webhooks", () => {
  it("replays a failed event from its stored payload", async () => {
    const early = {
      apiVersion: "x",
      event: { id: "wkd-replay", name: "checkout_session.completed", timestamp: "0" },
      object: { id: "scs-missing", type: "checkout_session" },
      data: { id: "scs-missing", status: "completed", metadata: {} },
    };
    expect((await webhooks.handleMonime(parseMonimeEvent(JSON.stringify(early))!, early)).response).toBe("retry");
    const [failed] = await admin.webhookEvents(staff, "failed");
    expect(await admin.replayWebhook(staff, failed.id)).toBe("failed"); // still no such payment
    await expect(admin.replayWebhook(staff, crypto.randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await repos.audit.listForTarget("webhook_event", failed.id))[0].action).toBe("webhook.replay");
  });
});

describe("users", () => {
  it("status changes revoke sessions; only super admins close accounts or change roles", async () => {
    await admin.setUserStatus(staff, creator.userId, "suspended", "fraud investigation");
    expect(await repos.users.findAuthState(creator.userId)).toMatchObject({ status: "suspended", sessionVersion: 2 });
    await expect(admin.setUserStatus(staff, creator.userId, "closed", "x")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.setUserStatus(staff, staff2.userId, "suspended", "x")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.setUserStatus(staff, staff.userId, "active", "x")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.setUserRole(staff, creator.userId, "staff")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.setUserRole(superAdmin, superAdmin.userId, "creator")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await admin.setUserRole(superAdmin, staff.userId, "super_admin");
    expect(await repos.users.findAuthState(staff.userId)).toMatchObject({ role: "super_admin", sessionVersion: 2 });
  });

  it("finds creators by handle, email and id", async () => {
    expect((await admin.searchCreators(staff, "amin"))[0]?.handle).toBe("aminata");
    expect((await admin.searchCreators(staff, "AMINATA@example.com"))[0]?.userId).toBe(creator.userId);
    expect((await admin.searchCreators(staff, creator.userId))[0]?.userId).toBe(creator.userId);
    expect(await admin.searchCreators(staff, "' OR 1=1 --")).toEqual([]);
    await expect(admin.searchCreators(creator, "a")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("audit export", () => {
  it("is super-admin only, audited, and neutralises spreadsheet formulas", async () => {
    await new AuditService(repos.audit).log({ actor: staff, action: "=HYPERLINK(\"http://evil\")", targetType: "x", targetId: "1" });
    await expect(admin.exportAuditCsv(staff, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    const csv = await admin.exportAuditCsv(superAdmin, {});
    expect(csv.split("\n")[0]).toBe("created_at,actor_id,actor_role,action,target_type,target_id,before,after");
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect((await repos.admin.auditLog({ action: "audit.export" }))).toHaveLength(1);
  });
});
