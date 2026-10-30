import { describe, expect, it, vi } from "vitest";
import type { CreatorWallet } from "@/server/db/schema";
import { FakeMonimeServer } from "@/server/integrations/monime/fake";
import type { MonimeEvent } from "@/server/integrations/monime/webhook";
import { AuthService } from "@/server/services/AuthService";
import { WALLET_MAX_ATTEMPTS, WalletService } from "@/server/services/WalletService";
import { WebhookRejected, WebhookRetryLater } from "@/server/services/WebhookService";
import { createAuthFakes } from "../fixtures/auth-fakes";

function walletRepo() {
  const rows = new Map<string, CreatorWallet>();
  const repo = {
    ensure: async (userId: string) => {
      if (!rows.has(userId)) {
        rows.set(userId, {
          id: crypto.randomUUID(),
          userId,
          monimeFinancialAccountId: null,
          uvan: null,
          currency: "SLE",
          status: "pending",
          attempts: 0,
          lastError: null,
          lastAttemptAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return { ...rows.get(userId)! };
    },
    findByUserId: async (userId: string) => rows.get(userId) ?? null,
    markActive: async (userId: string, account: { id: string; uvan: string }) => {
      const row = rows.get(userId)!;
      if (row.monimeFinancialAccountId && row.monimeFinancialAccountId !== account.id) throw new Error("unique violation");
      const next = { ...row, monimeFinancialAccountId: account.id, uvan: account.uvan, status: row.status === "frozen" ? row.status : ("active" as const), lastError: null };
      rows.set(userId, next);
      return next;
    },
    recordFailure: async (userId: string, error: string, failAfter: number) => {
      const row = rows.get(userId)!;
      if (row.status !== "pending" && row.status !== "failed") return row;
      const attempts = row.attempts + 1;
      const next = { ...row, attempts, lastError: error, status: attempts >= failAfter ? ("failed" as const) : ("pending" as const) };
      rows.set(userId, next);
      return next;
    },
  };
  return { rows, ensure: repo.ensure, repo: repo as never };
}

describe("WalletService.provisionForCreator", () => {
  it("creates one Monime account with a deterministic idempotency key and no PII", async () => {
    const server = new FakeMonimeServer();
    const { rows, repo } = walletRepo();
    const service = new WalletService({ wallets: repo }, server.client());

    const wallet = await service.provisionForCreator("11111111-2222-4333-8444-555555555555");
    expect(wallet.status).toBe("active");
    expect(rows.get("11111111-2222-4333-8444-555555555555")?.monimeFinancialAccountId).toMatch(/^fac-/);

    const [{ body, idempotencyKey: key }] = server.requests;
    expect(key).toBe("creator-wallet-11111111-2222-4333-8444-555555555555");
    expect(body).toMatchObject({ currency: "SLE", metadata: { userId: "11111111-2222-4333-8444-555555555555", app: "dumegud" } });
    expect(JSON.stringify(body)).not.toMatch(/@|email|phone/i);
  });

  it("concurrent calls end with exactly one account", async () => {
    const server = new FakeMonimeServer();
    const { rows, repo } = walletRepo();
    const service = new WalletService({ wallets: repo }, server.client());
    await Promise.all([service.provisionForCreator("u1"), service.provisionForCreator("u1"), service.provisionForCreator("u1")]);
    expect(server.accounts.size).toBe(1);
    expect(rows.get("u1")?.status).toBe("active");
  });

  it("is a no-op once active", async () => {
    const server = new FakeMonimeServer();
    const { repo } = walletRepo();
    const service = new WalletService({ wallets: repo }, server.client());
    await service.provisionForCreator("u1");
    await service.provisionForCreator("u1");
    expect(server.requests).toHaveLength(1);
  });

  it("records failures without throwing, and marks the wallet failed after the max attempts", async () => {
    const server = new FakeMonimeServer();
    const { rows, repo } = walletRepo();
    const service = new WalletService({ wallets: repo }, server.client());
    for (let i = 0; i < WALLET_MAX_ATTEMPTS; i++) {
      server.failNext(503, "internal", "upstream down");
      await expect(service.provisionForCreator("u1")).resolves.toBeDefined();
    }
    expect(rows.get("u1")).toMatchObject({ status: "failed", attempts: WALLET_MAX_ATTEMPTS, lastError: "internal: upstream down" });

    // A later retry (cron or the creator) can still succeed.
    expect((await service.provisionForCreator("u1")).status).toBe("active");
  });

  it("runs from AuthService.onUserCreated, and a wallet failure doesn't stop the verification email", async () => {
    const auth = createAuthFakes();
    const user = auth.addUser({});
    const provisionForCreator = vi.fn(async () => {
      throw new Error("boom");
    });
    const service = new AuthService({ ...auth.deps, wallets: { provisionForCreator } });
    await service.onUserCreated(user.id);
    expect(provisionForCreator).toHaveBeenCalledWith(user.id);
    expect(auth.sent.at(-1)?.tag).toBe("verify-email");
  });
});

describe("WalletService.onAccountCreated (financial_account.created webhook)", () => {
  const userId = "e6c995c0-f286-43af-b92d-5f943d47617b";

  // Shaped like the live event: Monime sends `uvan: ""` in it.
  function accountCreated(account: { id: string; reference: string | null }): MonimeEvent {
    return {
      apiVersion: "caph.2025-08-23",
      event: { id: `wkd-${crypto.randomUUID()}`, name: "financial_account.created", timestamp: "1793316855" },
      object: { id: account.id, type: "financial_account" },
      data: { id: account.id, reference: account.reference, currency: "SLE", uvan: "", metadata: { app: "dumegud", userId } },
    };
  }

  /** Monime created the account, but the create call's response never reached us. */
  async function lostCreateResponse(server: FakeMonimeServer, reference = `creator_${userId}`) {
    return server.client().createFinancialAccount({ name: "DuMeGud creator", currency: "SLE", reference }, `lost-${reference}`);
  }

  it("is a no-op when the wallet already has this account, and keeps its uvan", async () => {
    const server = new FakeMonimeServer();
    const { rows, repo } = walletRepo();
    const service = new WalletService({ wallets: repo }, server.client());
    const wallet = await service.provisionForCreator(userId);

    const result = await service.onAccountCreated(accountCreated({ id: wallet.monimeFinancialAccountId!, reference: `creator_${userId}` }));
    expect(result.status).toBe("processed");
    expect(rows.get(userId)).toMatchObject({ status: "active", uvan: wallet.uvan });
    expect(rows.get(userId)?.uvan).toMatch(/^FAKE/);
  });

  it("links a pending wallet whose create response was lost, with the uvan read from Monime", async () => {
    const server = new FakeMonimeServer();
    const { rows, ensure, repo } = walletRepo();
    const service = new WalletService({ wallets: repo }, server.client());
    await ensure(userId);
    const account = await lostCreateResponse(server);

    expect((await service.onAccountCreated(accountCreated({ id: account.id, reference: `creator_${userId}` }))).status).toBe("processed");
    expect(rows.get(userId)).toMatchObject({ status: "active", monimeFinancialAccountId: account.id, uvan: account.uvan });
  });

  it("rescues a wallet that ran out of provisioning attempts", async () => {
    const server = new FakeMonimeServer();
    const { rows, repo } = walletRepo();
    const service = new WalletService({ wallets: repo }, server.client());
    for (let i = 0; i < WALLET_MAX_ATTEMPTS; i++) {
      server.failNext(503, "internal", "upstream down");
      await service.provisionForCreator(userId);
    }
    expect(rows.get(userId)?.status).toBe("failed");
    const account = await lostCreateResponse(server);

    await service.onAccountCreated(accountCreated({ id: account.id, reference: `creator_${userId}` }));
    expect(rows.get(userId)).toMatchObject({ status: "active", monimeFinancialAccountId: account.id });
  });

  it("ignores accounts that aren't creator wallets (the platform account, other references)", async () => {
    const server = new FakeMonimeServer();
    const { repo } = walletRepo();
    const service = new WalletService({ wallets: repo }, server.client());
    for (const reference of [null, "main", "healthcheck_test", "creator_not-a-uuid"]) {
      expect((await service.onAccountCreated(accountCreated({ id: "fac-other", reference }))).status).toBe("ignored");
    }
    expect(server.requests).toHaveLength(0);
  });

  it("ignores an account for a creator with no wallet row", async () => {
    const server = new FakeMonimeServer();
    const { rows, repo } = walletRepo();
    const service = new WalletService({ wallets: repo }, server.client());
    const account = await lostCreateResponse(server);
    expect((await service.onAccountCreated(accountCreated({ id: account.id, reference: `creator_${userId}` }))).status).toBe("ignored");
    expect(rows.size).toBe(0);
  });

  it("never replaces an account already linked to the wallet", async () => {
    const server = new FakeMonimeServer();
    const { rows, repo } = walletRepo();
    const service = new WalletService({ wallets: repo }, server.client());
    const wallet = await service.provisionForCreator(userId);
    const other = await lostCreateResponse(server);

    await expect(service.onAccountCreated(accountCreated({ id: other.id, reference: `creator_${userId}` }))).rejects.toBeInstanceOf(WebhookRejected);
    expect(rows.get(userId)?.monimeFinancialAccountId).toBe(wallet.monimeFinancialAccountId);
  });

  it("rejects an account whose reference on Monime doesn't match the event", async () => {
    const server = new FakeMonimeServer();
    const { rows, ensure, repo } = walletRepo();
    const service = new WalletService({ wallets: repo }, server.client());
    await ensure(userId);
    const someoneElses = await lostCreateResponse(server, "creator_11111111-2222-4333-8444-555555555555");

    await expect(service.onAccountCreated(accountCreated({ id: someoneElses.id, reference: `creator_${userId}` }))).rejects.toBeInstanceOf(WebhookRejected);
    expect(rows.get(userId)).toMatchObject({ status: "pending", monimeFinancialAccountId: null });
  });

  it("asks Monime to retry when the account can't be read yet", async () => {
    const server = new FakeMonimeServer();
    const { rows, ensure, repo } = walletRepo();
    const service = new WalletService({ wallets: repo }, server.client());
    await ensure(userId);
    const account = await lostCreateResponse(server);
    server.failNext(503, "internal", "upstream down");

    await expect(service.onAccountCreated(accountCreated({ id: account.id, reference: `creator_${userId}` }))).rejects.toBeInstanceOf(WebhookRetryLater);
    expect(rows.get(userId)?.status).toBe("pending");
  });
});
