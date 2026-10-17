import { describe, expect, it, vi } from "vitest";
import type { CreatorWallet } from "@/server/db/schema";
import { FakeMonimeServer } from "@/server/integrations/monime/fake";
import { AuthService } from "@/server/services/AuthService";
import { WALLET_MAX_ATTEMPTS, WalletService } from "@/server/services/WalletService";
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
      rows.set(userId, { ...row, monimeFinancialAccountId: account.id, uvan: account.uvan, status: "active", lastError: null });
    },
    recordFailure: async (userId: string, error: string, failAfter: number) => {
      const row = rows.get(userId)!;
      const attempts = row.attempts + 1;
      const next = { ...row, attempts, lastError: error, status: attempts >= failAfter ? ("failed" as const) : ("pending" as const) };
      rows.set(userId, next);
      return next;
    },
  };
  return { rows, repo: repo as never };
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
