import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { EmailMessage } from "@/server/integrations/email";
import { FakeMonimeServer } from "@/server/integrations/monime/fake";
import { AccountDeletionRepository } from "@/server/repositories/AccountDeletionRepository";
import { CategoryRepository } from "@/server/repositories/CategoryRepository";
import { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import { HandleRepository } from "@/server/repositories/HandleRepository";
import { KycRepository } from "@/server/repositories/KycRepository";
import { LedgerRepository } from "@/server/repositories/LedgerRepository";
import { PaymentRepository } from "@/server/repositories/PaymentRepository";
import { PayoutMethodRepository } from "@/server/repositories/PayoutMethodRepository";
import { PayoutRepository } from "@/server/repositories/PayoutRepository";
import { ProductRepository } from "@/server/repositories/ProductRepository";
import { RiskRepository } from "@/server/repositories/RiskRepository";
import { UserRepository } from "@/server/repositories/UserRepository";
import { AccountDeletionService } from "@/server/services/AccountDeletionService";
import type { Actor } from "@/server/services/actor";
import { CreatorService } from "@/server/services/CreatorService";
import { accounts, settleJournal, transferJournal } from "@/server/services/ledger";
import { runInTransaction } from "@/server/services/transaction";
import { WalletService } from "@/server/services/WalletService";
import { createMemoryStorage } from "../fixtures/creator-fakes";
import { createTestDb, racingTransaction, type TestDb } from "./db";

// Creators deleting their own account: never while money is owed, a 30-day grace period, then
// erasure that keeps money records but nothing personal.

const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = "right-password";

let t: TestDb;
let monimeServer: FakeMonimeServer;
let store: ReturnType<typeof createMemoryStorage>;
let sent: (EmailMessage & { to: string })[];
let alerts: unknown[];
let now: Date;
let creator: Actor;
let walletAccountId: string;
let deletions: AccountDeletionService;
let deletionDeps: ConstructorParameters<typeof AccountDeletionService>[0];

const repos = {
  accountDeletions: new AccountDeletionRepository(),
  users: new UserRepository(),
  profiles: new CreatorProfileRepository(),
  products: new ProductRepository(),
  payouts: new PayoutRepository(),
  payments: new PaymentRepository(),
  ledger: new LedgerRepository(),
  wallets: new CreatorWalletRepository(),
  payoutMethods: new PayoutMethodRepository(),
  kyc: new KycRepository(),
  risk: new RiskRepository(),
  handles: new HandleRepository(),
  categories: new CategoryRepository(),
};

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

beforeEach(async () => {
  await t.client.exec(
    `truncate account_deletions, risk_cases, kyc_submissions, payout_methods, ledger_entries, ledger_journals, payment_events,
     contributions, payments, products, social_links, handle_history, creator_wallets, creator_profiles, accounts, users cascade`,
  );
  now = new Date();
  sent = [];
  alerts = [];
  store = createMemoryStorage();
  monimeServer = new FakeMonimeServer();
  monimeServer.seedAccount({ id: "fac-platform" });
  const monime = monimeServer.client();

  const user = (await repos.users.insertIfEmailFree({ email: "aminata@example.com", name: "Aminata", passwordHash: "argon2-hash" }))!;
  walletAccountId = (await new WalletService(repos, monime).provisionForCreator(user.id)).monimeFinancialAccountId!;
  await repos.profiles.insert(user.id, { handle: "Aminata", handleLower: "aminata", displayName: "Aminata", bio: "Singer", categoryId: null, supportMessageEnabled: true });
  await repos.profiles.setStatusOwned(user.id, "published", now);
  await repos.profiles.setAvatarKeyOwned(user.id, "avatars/a.webp");
  store.put("public", "avatars/a.webp", new Uint8Array([1]));
  creator = { userId: user.id, status: "active", emailVerified: true };

  deletionDeps = {
    repos,
    monime,
    auth: { confirmPassword: async (_actor, password) => password === PASSWORD },
    email: { send: async (m) => void sent.push(m) },
    appBaseUrl: "https://dumegud.test",
    platformAccountId: () => "fac-platform",
    storage: store.storage,
    buckets: { public: "public", kyc: "kyc" },
    risk: { raise: async (a) => void alerts.push(a) },
    now: () => now,
    rateLimit: async () => {},
  };
  deletions = new AccountDeletionService(deletionDeps);
});

/** A settled payment whose transfer to the wallet hasn't happened yet. */
const moneyOnItsWay = () =>
  t.client.query(
    `insert into payments (kind, creator_id, status, gross_minor, platform_fee_bps, idempotency_key, creator_net_minor, settlement_frozen)
     values ('contribution', $1, 'succeeded', 2000, 0, $2, 2000, false)`,
    [creator.userId, `late-${crypto.randomUUID()}`],
  );

/** Money the creator earned: settled, transferred to their wallet (ledger + fake Monime). */
async function earn(amountMinor: number) {
  const id = crypto.randomUUID();
  await t.client.query(
    `insert into payments (id, kind, creator_id, status, gross_minor, platform_fee_bps, idempotency_key, creator_net_minor, settlement_frozen)
     values ($1, 'contribution', $2, 'succeeded', $3, 0, $4, $3, true)`,
    [id, creator.userId, amountMinor, `earn-${id}`],
  );
  await runInTransaction(async (tx) => {
    await repos.ledger.postJournal(settleJournal({ id, creatorId: creator.userId, arrivedMinor: amountMinor, creatorNetMinor: amountMinor, platformFeeMinor: 0 }), tx);
    await repos.ledger.postJournal(transferJournal({ id, creatorId: creator.userId, creatorNetMinor: amountMinor }), tx);
  });
  monimeServer.accounts.get(walletAccountId)!.availableMinor += amountMinor;
}

const confirm = { handle: "@aminata", password: PASSWORD };
const owed = async () => 0 - (await repos.ledger.balance(accounts.creatorPayable(creator.userId)));

describe("money checks", () => {
  it("refuses while the wallet holds money, and asks to withdraw it", async () => {
    await earn(5_000);
    const r = await deletions.readiness(creator);
    expect(r.canDelete).toBe(false);
    expect(r.checks.find((c) => c.key === "balance")).toMatchObject({ done: false, fix: "withdraw" });
    await expect(deletions.requestDeletion(creator, confirm)).rejects.toThrow(/Withdraw it first/);
  });

  it("fails closed when the live balance can't be read", async () => {
    monimeServer.failNext(503, "internal_error", "down", "/financial-accounts/");
    const r = await deletions.readiness(creator);
    expect(r.canDelete).toBe(false);
    expect(r.checks.find((c) => c.key === "balance")).toMatchObject({ fix: "wait" });
  });

  it("refuses while a gift is confirming, money is on its way, or a review is open", async () => {
    await t.client.query(
      `insert into payments (kind, creator_id, status, gross_minor, platform_fee_bps, idempotency_key) values ('contribution', $1, 'pending', 1000, 0, 'p1')`,
      [creator.userId],
    );
    await t.client.query(
      `insert into payments (kind, creator_id, status, gross_minor, platform_fee_bps, idempotency_key, creator_net_minor, settlement_frozen)
       values ('contribution', $1, 'succeeded', 2000, 0, 'p2', 2000, false)`,
      [creator.userId],
    );
    await t.client.query(`insert into risk_cases (creator_id) values ($1)`, [creator.userId]);
    const r = await deletions.readiness(creator);
    const failed = r.checks.filter((c) => !c.done).map((c) => c.key);
    expect(failed).toEqual(expect.arrayContaining(["hold", "confirming", "on-its-way"]));
    expect(r.checks.find((c) => c.key === "hold")?.fix).toBe("support");
  });

  it("ignores checkouts abandoned more than a day ago, but not payments held for review", async () => {
    const old = new Date(now.getTime() - 2 * DAY);
    await t.client.query(
      `insert into payments (kind, creator_id, status, gross_minor, platform_fee_bps, idempotency_key, created_at) values ('contribution', $1, 'pending', 1000, 0, 'old', $2)`,
      [creator.userId, old],
    );
    expect((await deletions.readiness(creator)).checks.find((c) => c.key === "confirming")?.done).toBe(true);
    await t.client.query(
      `insert into payments (kind, creator_id, status, gross_minor, platform_fee_bps, idempotency_key, created_at) values ('contribution', $1, 'under_review', 1000, 0, 'held', $2)`,
      [creator.userId, old],
    );
    expect((await deletions.readiness(creator)).checks.find((c) => c.key === "confirming")?.done).toBe(false);
  });

  it("lets a remainder of at most Le 1 be given up, moving it to the platform", async () => {
    await earn(40);
    const r = await deletions.readiness(creator);
    expect(r).toMatchObject({ canDelete: true, forfeitableMinor: 40 });
    await expect(deletions.requestDeletion(creator, confirm)).rejects.toMatchObject({ fieldErrors: { forfeit: [expect.any(String)] } });

    await deletions.requestDeletion(creator, { ...confirm, forfeit: true });
    expect(await owed()).toBe(0);
    expect(monimeServer.accounts.get(walletAccountId)!.availableMinor).toBe(0);
    expect(monimeServer.accounts.get("fac-platform")!.availableMinor).toBe(40);
    expect((await repos.accountDeletions.findOpen(creator.userId))?.forfeitedMinor).toBe(40);
  });

  it("won't let more than Le 1 be given up", async () => {
    await earn(101);
    expect((await deletions.readiness(creator)).forfeitableMinor).toBe(0);
    await expect(deletions.requestDeletion(creator, { ...confirm, forfeit: true })).rejects.toThrow(/Withdraw it first/);
  });
});

describe("requesting and cancelling", () => {
  it("needs the exact handle and the password", async () => {
    await expect(deletions.requestDeletion(creator, { handle: "aminatta", password: PASSWORD })).rejects.toMatchObject({ fieldErrors: { handle: [expect.any(String)] } });
    await expect(deletions.requestDeletion(creator, { handle: "aminata", password: "wrong" })).rejects.toMatchObject({ fieldErrors: { password: [expect.any(String)] } });
  });

  it("takes the page offline, signs out everywhere, emails, and blocks going live until cancelled", async () => {
    const sessionBefore = (await repos.users.findById(creator.userId))!.sessionVersion;
    const { eraseAfter, tags } = await deletions.requestDeletion(creator, confirm);
    expect(eraseAfter.getTime() - now.getTime()).toBe(30 * DAY);
    expect(tags).toContain("handle:aminata");
    expect((await repos.profiles.findByUserId(creator.userId))!.status).toBe("unpublished");
    expect((await repos.users.findById(creator.userId))!.sessionVersion).toBe(sessionBefore + 1);
    expect(sent.at(-1)).toMatchObject({ to: "aminata@example.com", tag: "account-deletion-scheduled" });
    await expect(deletions.requestDeletion(creator, confirm)).rejects.toThrow(/already scheduled/);

    const creators = new CreatorService({ repos, publicAssetUrl: () => null, deletions: repos.accountDeletions });
    await expect(creators.publish(creator)).rejects.toThrow(/scheduled for deletion/);

    await deletions.cancelDeletion(creator);
    expect(await deletions.status(creator)).toBeNull();
    expect(sent.at(-1)?.tag).toBe("account-deletion-canceled");
    await expect(creators.publish(creator)).rejects.not.toThrow(/scheduled for deletion/);
  });
});

describe("erasure", () => {
  async function insertKyc() {
    await repos.kyc.insert({
      userId: creator.userId,
      legalNameEnc: "enc",
      dateOfBirthEnc: "enc",
      idType: "national_id",
      idNumberHash: "hash",
      idFrontKey: "kyc/front.jpg",
      selfieKey: "kyc/selfie.jpg",
    });
    store.put("kyc", "kyc/front.jpg", new Uint8Array([1]));
    store.put("kyc", "kyc/selfie.jpg", new Uint8Array([1]));
  }

  it("waits 30 days, then erases personal data but keeps money records", async () => {
    await insertKyc();
    await earn(40);
    await deletions.requestDeletion(creator, { ...confirm, forfeit: true });
    const journals = (await t.client.query("select count(*)::int as n from ledger_journals")).rows[0];

    now = new Date(now.getTime() + 29 * DAY);
    expect((await deletions.eraseDue()).erased).toBe(0);

    now = new Date(now.getTime() + 2 * DAY);
    const result = await deletions.eraseDue();
    expect(result).toMatchObject({ erased: 1, blocked: 0, failed: 0 });

    const user = (await repos.users.findById(creator.userId))!;
    expect(user).toMatchObject({ email: `deleted+${creator.userId}@users.invalid`, name: null, passwordHash: null, status: "closed" });
    const profile = (await repos.profiles.findByUserId(creator.userId))!;
    expect(profile).toMatchObject({ displayName: "Deleted creator", bio: "", avatarKey: null, status: "unpublished" });
    expect(profile.handle).toMatch(/^deleted_[0-9a-f]{10}$/);
    expect((await repos.wallets.findByUserId(creator.userId))!.status).toBe("frozen");
    expect((await t.client.query("select count(*)::int as n from ledger_journals")).rows[0]).toEqual(journals);

    expect(store.objects.has("public/avatars/a.webp")).toBe(false);
    expect(store.objects.has("kyc/kyc/front.jpg")).toBe(false);
    expect(sent.at(-1)).toMatchObject({ to: "aminata@example.com", tag: "account-deleted" });

    // The handle is free: someone else can claim it.
    const other = (await repos.users.insertIfEmailFree({ email: "new@example.com", name: "New", passwordHash: null }))!;
    await expect(
      repos.profiles.insert(other.id, { handle: "aminata", handleLower: "aminata", displayName: "New", bio: "", categoryId: null, supportMessageEnabled: true }),
    ).resolves.toBeTruthy();
    // The original email can sign up again.
    expect(await repos.users.insertIfEmailFree({ email: "aminata@example.com", name: "Again", passwordHash: null })).toBeTruthy();

    expect((await deletions.eraseDue()).erased).toBe(0); // done once
  });

  it("is blocked, and raises an alert, if money arrived during the grace period", async () => {
    await deletions.requestDeletion(creator, confirm);
    await earn(5_000);
    now = new Date(now.getTime() + 31 * DAY);
    expect(await deletions.eraseDue()).toMatchObject({ erased: 0, blocked: 1 });
    expect(alerts).toEqual([expect.objectContaining({ ruleCode: "DELETION_BLOCKED_MONEY" })]);
    expect((await repos.users.findById(creator.userId))!.status).toBe("active");
  });

  it("doesn't erase a cancelled request", async () => {
    await deletions.requestDeletion(creator, confirm);
    await deletions.cancelDeletion(creator);
    now = new Date(now.getTime() + 31 * DAY);
    expect((await deletions.eraseDue()).erased).toBe(0);
  });
});

describe("races", () => {
  it("refuses the deletion if money moved between the checks and the lock", async () => {
    const racing = new AccountDeletionService({ ...deletionDeps, transaction: racingTransaction(moneyOnItsWay) });
    await expect(racing.requestDeletion(creator, confirm)).rejects.toThrow(/Something changed/);
    expect(await deletions.status(creator)).toBeNull();
    expect((await repos.profiles.findByUserId(creator.userId))!.status).toBe("published");
  });

  it("holds the erasure if money arrived between its checks and the freeze", async () => {
    await deletions.requestDeletion(creator, confirm);
    now = new Date(now.getTime() + 31 * DAY);
    const racing = new AccountDeletionService({ ...deletionDeps, transaction: racingTransaction(moneyOnItsWay) });
    expect(await racing.eraseDue()).toMatchObject({ erased: 0, blocked: 1 });
    expect((await repos.users.findById(creator.userId))!.status).toBe("active");
    expect((await repos.wallets.findByUserId(creator.userId))!.status).toBe("active");
  });

  it("won't publish when a deletion committed after publish checked for one", async () => {
    await repos.profiles.setStatusOwned(creator.userId, "unpublished", null);
    await repos.profiles.acceptTermsOwned(creator.userId, now);
    const creators = new CreatorService({
      repos,
      publicAssetUrl: () => null,
      deletions: repos.accountDeletions,
      transaction: racingTransaction(() => deletions.requestDeletion(creator, confirm)),
    });
    await expect(creators.publish(creator)).rejects.toThrow(/scheduled for deletion/);
    expect((await repos.profiles.findByUserId(creator.userId))!.status).toBe("unpublished");
  });
});
