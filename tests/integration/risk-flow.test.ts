import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeMonimeServer } from "@/server/integrations/monime/fake";
import { parseMonimeEvent } from "@/server/integrations/monime/webhook";
import { AuditRepository } from "@/server/repositories/AuditRepository";
import { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import { LedgerRepository } from "@/server/repositories/LedgerRepository";
import { PaymentRepository } from "@/server/repositories/PaymentRepository";
import { ShoutoutRepository } from "@/server/repositories/ShoutoutRepository";
import { PlatformSettingsRepository } from "@/server/repositories/PlatformSettingsRepository";
import { ProductRepository } from "@/server/repositories/ProductRepository";
import { RiskRepository } from "@/server/repositories/RiskRepository";
import { UserRepository } from "@/server/repositories/UserRepository";
import { WebhookEventRepository } from "@/server/repositories/WebhookEventRepository";
import type { Actor } from "@/server/services/actor";
import { AdminConfigService } from "@/server/services/AdminConfigService";
import { CaseService } from "@/server/services/CaseService";
import { AuditService, RestrictionService } from "@/server/services/compliance";
import { ContributionService } from "@/server/services/ContributionService";
import { LimitService } from "@/server/services/LimitService";
import { PlatformSettingsService } from "@/server/services/PlatformSettingsService";
import { ReportService } from "@/server/services/ReportService";
import { RiskService } from "@/server/services/RiskService";
import { SettlementService } from "@/server/services/SettlementService";
import { TransferService } from "@/server/services/TransferService";
import { WalletService } from "@/server/services/WalletService";
import { WebhookService } from "@/server/services/WebhookService";
import { createTestDb, type TestDb } from "./db";

// Phase 7 acceptance on real SQL: admin-edited limits apply immediately and are audited; rapid
// payments raise alerts; a supporter→creator breach holds the payment before transfer; cases,
// restrictions and dual approval; reports; the audit log is append-only.

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
  products: new ProductRepository(),
};

let contributions: ContributionService;
let webhooks: WebhookService;
let cases: CaseService;
let config: AdminConfigService;
let reports: ReportService;
let restrictions: RestrictionService;
let settings: PlatformSettingsService;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

async function staffUser(email: string, role: "staff" | "super_admin"): Promise<Actor> {
  const u = (await repos.users.insertIfEmailFree({ email, name: email, passwordHash: null }))!;
  return { userId: u.id, role, status: "active", emailVerified: true };
}

beforeEach(async () => {
  await t.client.exec(
    `truncate risk_alerts, risk_cases, account_restrictions, content_reports, moderation_actions, ledger_entries, ledger_journals,
     payment_events, contributions, payments, webhook_events, creator_wallets, creator_profiles, transaction_limits, risk_rules, users cascade`,
  );
  // Re-seed what CASCADE emptied (settings, rules, limits).
  for (const f of ["0005_seed_platform_settings.sql", "0007_seed_product_settings.sql", "0009_seed_payout_settings.sql", "0011_append_only_and_seed_risk.sql"]) {
    const sqlText = readFileSync(`server/db/migrations/${f}`, "utf8");
    for (const stmt of sqlText.split("--> statement-breakpoint")) {
      if (/CREATE (OR REPLACE FUNCTION|TRIGGER)/.test(stmt)) continue; // already installed
      if (stmt.trim()) await t.client.exec(stmt);
    }
  }
  monimeServer = new FakeMonimeServer();
  const monime = monimeServer.client();
  const platformId = monimeServer.seedAccount({ id: "fac-platform" }).id;
  settings = new PlatformSettingsService(repos.settings);
  const audit = new AuditService(repos.audit);
  restrictions = new RestrictionService(repos.risk);
  const limits = new LimitService(repos.risk);
  const risk = new RiskService(repos);
  const transfers = new TransferService({ repos, monime, platformAccountId: () => platformId, sleep: async () => {} });
  const settlement = new SettlementService({ repos, transfers, settings, monime, limits, risk });
  contributions = new ContributionService({
    repos,
    monime,
    settings,
    platformAccountId: () => platformId,
    appBaseUrl: "https://dumegud.test",
    rateLimit: async () => {},
    restrictions,
    limits,
    risk,
  });
  webhooks = new WebhookService(repos.webhookEvents, settlement.webhookHandlers());
  cases = new CaseService(repos, settings, audit);
  config = new AdminConfigService(repos, audit);
  reports = new ReportService(repos, audit);

  const user = (await repos.users.insertIfEmailFree({ email: "aminata@example.com", name: "Aminata", passwordHash: null }))!;
  await new WalletService(repos, monime).provisionForCreator(user.id);
  await repos.profiles.insert(user.id, { handle: "aminata", handleLower: "aminata", displayName: "Aminata", bio: "", categoryId: null, supportMessageEnabled: true });
  await repos.profiles.setStatusOwned(user.id, "published", new Date());
  creator = { userId: user.id, role: "creator", status: "active", emailVerified: true };
  staff = await staffUser("staff1@dumegud.test", "staff");
  staff2 = await staffUser("staff2@dumegud.test", "staff");
  superAdmin = await staffUser("root@dumegud.test", "super_admin");
});

let ipCounter = 0;
async function support(amount: number, fingerprint = "payer-1") {
  const { paymentId } = await contributions.start(
    { handle: "aminata", amount, supporterName: null, message: null, isAnonymous: true },
    { ip: `198.51.100.${ipCounter++ % 250}`, userAgent: "t" },
  );
  const payment = (await repos.payments.findById(paymentId))!;
  for (const e of monimeServer.completeCheckout(payment.monimeCheckoutSessionId!, { fingerprint })) {
    await webhooks.handleMonime(parseMonimeEvent(JSON.stringify(e))!, e);
  }
  return (await repos.payments.findById(paymentId))!;
}

describe("audit log", () => {
  it("is append-only for every role", async () => {
    await new AuditService(repos.audit).log({ actor: staff, action: "test", targetType: "x", targetId: "1" });
    await expect(t.client.query("update audit_logs set action = 'tampered'")).rejects.toThrow(/append-only/);
    await expect(t.client.query("delete from audit_logs")).rejects.toThrow(/append-only/);
    await expect(t.client.query("update ledger_entries set amount_minor = 1")).resolves.toBeDefined(); // no rows yet
    await support(10_000);
    await expect(t.client.query("update ledger_entries set amount_minor = 1")).rejects.toThrow(/append-only/);
    await expect(t.client.query("delete from payment_events")).rejects.toThrow(/append-only/);
  });
});

describe("admin-configured limits", () => {
  it("a per-contribution change takes effect immediately and is audited with before/after", async () => {
    await expect(support(30_000)).resolves.toMatchObject({ status: "succeeded" });
    const [limit] = (await config.listLimits(staff)).filter((l) => l.scope === "per_contribution");
    await expect(config.saveLimit(staff, limit.id, { ...limit, maxAmountMinor: 20_000 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await config.saveLimit(superAdmin, limit.id, { ...limit, maxAmountMinor: 20_000 });

    await expect(support(30_000)).rejects.toThrow(/can't receive this amount/);
    const entries = await repos.audit.listForTarget("transaction_limit", limit.id);
    expect(entries[0]).toMatchObject({ action: "limit.update", actorId: superAdmin.userId });
    expect((entries[0].before as { maxAmountMinor: number }).maxAmountMinor).toBe(50_000);
    expect((entries[0].after as { maxAmountMinor: number }).maxAmountMinor).toBe(20_000);
  });

  it("settings changes are versioned, validated and audited", async () => {
    await expect(config.updateSetting(superAdmin, "fees.contributionBps", 20_000)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await config.updateSetting(superAdmin, "fees.contributionBps", 250)).toBe(2);
    expect((await settings.get()).contributionFeeBps).toBe(250);
    const { rows } = await t.client.query<{ version: number }>("select version from platform_settings_history where key = 'fees.contributionBps'");
    expect(rows).toEqual([{ version: 2 }]);
    // An editor who opened the page at version 1 can't silently overwrite version 2.
    await expect(config.updateSetting(superAdmin, "fees.contributionBps", 300, 1)).rejects.toThrow(/Someone else changed/);
    expect(await config.updateSetting(superAdmin, "fees.contributionBps", 300, 2)).toBe(3);
    expect((await repos.audit.listForTarget("platform_setting", "fees.contributionBps"))[0].action).toBe("setting.update");
  });
});

describe("monitoring and payer limits", () => {
  it("10 rapid contributions from one payer raise an alert (signal, not restriction)", async () => {
    for (let i = 0; i < 10; i++) await support(2_000, "same-payer");
    const alerts = await repos.risk.listAlerts("open");
    expect(alerts.map((a) => a.ruleCode)).toContain("RAPID_REPEAT");
    expect(await restrictions.isRestricted(creator.userId, "receive")).toBe(false);
  });

  it("breaching the supporter→creator 24h limit holds the payment for review with no transfer", async () => {
    const first = await support(50_000, "big-payer");
    expect(first).toMatchObject({ status: "succeeded", transferStatus: "completed" });
    const second = await support(50_000, "big-payer");
    expect(second).toMatchObject({ status: "succeeded", transferStatus: "completed" }); // exactly 100,000: at the limit
    const third = await support(10_000, "big-payer");
    expect(third).toMatchObject({ status: "under_review", transferStatus: "none" });
    expect(monimeServer.transfers.size).toBe(2);
    expect((await repos.risk.listAlerts("open")).map((a) => a.ruleCode)).toContain("LIMIT_SUPPORTER_TO_CREATOR");
  });

  it("a creator-receipts 'review' limit at checkout sends the payment to review on settlement", async () => {
    await t.db.execute(sql`update transaction_limits set max_amount_minor = 30000 where scope = 'creator_receipts'`);
    await support(20_000, "a");
    const held = await support(20_000, "b");
    expect(held).toMatchObject({ status: "under_review", transferStatus: "none" });
    expect(held.reviewHold).toContain("creator_receipts/24h");
  });
});

describe("cases and restrictions", () => {
  it("restricting stops receiving support; restoring lifts it; everything is audited", async () => {
    await support(10_000);
    const c = await cases.openCase(staff, { creatorId: creator.userId, alertIds: [], note: "manual review" });
    expect(await cases.decide(staff, c.id, { decision: "restrict", notes: "investigating" })).toEqual({ applied: true });
    await expect(support(10_000)).rejects.toThrow(/can't receive support/);

    const c2 = await cases.openCase(staff, { creatorId: creator.userId, alertIds: [], note: "" });
    await cases.decide(staff, c2.id, { decision: "restore", notes: "cleared" });
    await expect(support(10_000)).resolves.toMatchObject({ status: "succeeded" });
    const audits = await repos.audit.listForTarget("risk_case", c.id);
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["case.open", "case.decide.restrict"]));
  });

  it("restricting a creator owed a lot needs a second, different staff member", async () => {
    await config.updateSetting(superAdmin, "risk.dualApprovalMinBalance", 5_000);
    await support(10_000); // creator is now owed ~9,600
    const c = await cases.openCase(staff, { creatorId: creator.userId, alertIds: [], note: "" });
    expect(await cases.decide(staff, c.id, { decision: "restrict", notes: "first" })).toEqual({ applied: false });
    expect(await restrictions.isRestricted(creator.userId, "receive")).toBe(false);
    await expect(cases.decide(staff, c.id, { decision: "restrict", notes: "again" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await cases.decide(staff2, c.id, { decision: "restrict", notes: "second" })).toEqual({ applied: true });
    expect(await restrictions.isRestricted(creator.userId, "withdraw")).toBe(true);
  });

  it("creators can't open cases or decide", async () => {
    await expect(cases.openCase(creator, { creatorId: creator.userId, alertIds: [], note: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("reports", () => {
  it("public reports reach the queue, and suspending takes the target down with an audit trail", async () => {
    const profile = (await repos.profiles.findByUserId(creator.userId))!;
    await reports.submit({ targetType: "creator", targetId: profile.id, reason: "impersonation", details: "Not the real Aminata", reporterEmail: null }, { ip: "203.0.113.1", userAgent: null });
    await expect(reports.submit({ targetType: "product", targetId: crypto.randomUUID(), reason: "scam", details: "", reporterEmail: null }, { ip: "x", userAgent: null })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const [open] = await reports.listOpen(staff);
    expect(open).toMatchObject({ reason: "impersonation", targetLabel: "aminata" });
    const change = await reports.resolve(staff, open.id, { action: "suspend", reason: "impersonation confirmed" });
    expect(change.tags).toEqual(expect.arrayContaining([`creator:${profile.id}`, "handle:aminata"]));
    expect((await repos.profiles.findByUserId(creator.userId))!.status).toBe("suspended");
    await expect(reports.resolve(staff, open.id, { action: "dismiss", reason: "" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await repos.audit.listForTarget("creator", profile.id))[0].action).toBe("report.suspend");
  });
});

describe("races", () => {
  const alert = (ruleCode: string, severity: "low" | "medium" | "high" = "medium") =>
    repos.risk.insertAlert({ ruleCode, subjectType: "creator", subjectId: creator.userId, creatorId: creator.userId, severity, evidence: {} });

  it("the risk tier is only raised from the tier it was decided against (never lowered)", async () => {
    await t.client.query("update creator_profiles set risk_tier = 'high' where user_id = $1", [creator.userId]);
    // A signal that read `low` before staff raised the tier must not write `medium` over `high`.
    expect(await repos.profiles.raiseRiskTier(creator.userId, "low", "medium")).toBe(false);
    expect((await repos.profiles.findByUserId(creator.userId))!.riskTier).toBe("high");
  });

  it("one signal raised twice at once records one alert", async () => {
    const risk = new RiskService(repos);
    const input = { ruleCode: "RAPID_REPEAT", subjectType: "creator" as const, subjectId: creator.userId, creatorId: creator.userId, severity: "high" as const, evidence: {} };
    await Promise.all([risk.raise(input), risk.raise(input)]);
    const { rows } = await t.client.query("select id from risk_alerts where rule_code = 'RAPID_REPEAT'");
    expect(rows).toHaveLength(1);
    expect((await repos.profiles.findByUserId(creator.userId))!.riskTier).toBe("medium");
  });

  it("an alert already in a case can't be pulled into another, and dismissing it is refused", async () => {
    const a = await alert("SELF_FUNDING");
    const first = await cases.openCase(staff, { creatorId: creator.userId, alertIds: [a.id], note: "" });
    await expect(cases.openCase(staff2, { creatorId: creator.userId, alertIds: [a.id], note: "" })).rejects.toThrow(/another case/);
    await expect(cases.dismissAlert(staff2, a.id)).rejects.toThrow(/no longer open/);
    expect((await repos.risk.findAlerts([a.id]))[0]).toMatchObject({ status: "escalated", caseId: first.id });
    expect(await cases.listOpen(staff)).toHaveLength(1); // the second case was rolled back
  });

  it("notes added at the same time are all kept", async () => {
    const c = await cases.openCase(staff, { creatorId: creator.userId, alertIds: [], note: "" });
    await Promise.all([cases.addNote(staff, c.id, "one"), cases.addNote(staff2, c.id, "two")]);
    const notes = (await repos.risk.findCase(c.id))!.notes as { text: string }[];
    expect(notes.map((n) => n.text).sort()).toEqual(["one", "two"]);
  });
});
