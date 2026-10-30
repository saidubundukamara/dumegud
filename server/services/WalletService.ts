import "server-only";
import type { CreatorWallet, WalletStatus } from "@/server/db/schema";
import { isUuid } from "@/lib/uuid";
import { MonimeApiError, type FinancialAccount, type MonimeClient } from "@/server/integrations/monime";
import type { MonimeEvent } from "@/server/integrations/monime/webhook";
import { logger } from "@/server/lib/logger";
import type { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import type { Actor } from "./actor";
import { WebhookRejected, WebhookRetryLater, type WebhookHandler, type WebhookHandlerResult } from "./WebhookService";

/** After this many failed Monime calls the wallet is marked `failed` and needs staff attention. */
export const WALLET_MAX_ATTEMPTS = 5;

export type WalletDTO = { status: WalletStatus | "missing"; ready: boolean; attempts: number };

type WalletRepos = { wallets: CreatorWalletRepository };

export class WalletService {
  private readonly now: () => Date;

  constructor(
    private readonly repos: WalletRepos,
    private readonly monime: MonimeClient,
    opts: { now?: () => Date } = {},
  ) {
    this.now = opts.now ?? (() => new Date());
  }

  /**
   * Create the creator's Monime financial account. Idempotent and safe to call concurrently:
   * the idempotency key is deterministic (Monime returns the same account for repeat calls) and
   * the account id column is unique. Never throws for Monime failures: it records the attempt
   * so the retry cron (Phase 9) can pick it up.
   */
  async provisionForCreator(userId: string): Promise<CreatorWallet> {
    const wallet = await this.repos.wallets.ensure(userId);
    if (wallet.status === "active" || wallet.status === "frozen") return wallet;

    try {
      // Outside any transaction. No PII in Monime: the user id is enough to reconcile.
      const account = await this.monime.createFinancialAccount(
        {
          name: `DuMeGud creator ${userId.slice(0, 8)}`,
          currency: "SLE",
          reference: `creator_${userId}`,
          description: "DuMeGud creator wallet",
          metadata: { userId, app: "dumegud" },
        },
        `creator-wallet-${userId}`,
      );
      return await this.repos.wallets.markActive(userId, { id: account.id, uvan: account.uvan }, this.now());
    } catch (err) {
      // Only Monime's code/message are stored: never the raw response.
      const message = err instanceof MonimeApiError ? `${err.code}: ${err.message}` : "unexpected error";
      const row = await this.repos.wallets.recordFailure(userId, message.slice(0, 300), WALLET_MAX_ATTEMPTS, this.now());
      if (row.status === "failed") {
        logger.error("wallet provisioning failed permanently; needs staff attention", { userId, attempts: row.attempts, err });
      } else {
        logger.warn("wallet provisioning failed; will retry", { userId, attempts: row.attempts, err });
      }
      return row;
    }
  }

  webhookHandlers(): Record<string, WebhookHandler> {
    return { "financial_account.created": (e) => this.onAccountCreated(e) };
  }

  /**
   * `financial_account.created`. Normally the create call already recorded the account and this
   * is a no-op. It matters when that call's response was lost: the wallet is still pending or
   * failed, and the event links it without waiting for the cron (which stops after the max
   * attempts). It never replaces a linked account, and the account is re-read from Monime
   * because the event's `uvan` arrives empty.
   */
  async onAccountCreated(event: MonimeEvent): Promise<WebhookHandlerResult> {
    const accountId = event.object?.id ?? (typeof event.data.id === "string" ? event.data.id : null);
    const userId = creatorIdFromReference(event.data.reference);
    // The platform account, or any account this app didn't create for a creator.
    if (!accountId || !userId) return { status: "ignored" };

    const wallet = await this.repos.wallets.findByUserId(userId);
    if (!wallet) {
      logger.warn("monime account created for a creator with no wallet row; ignored", { userId });
      return { status: "ignored" };
    }
    if (wallet.monimeFinancialAccountId === accountId) return { status: "processed" };
    if (wallet.monimeFinancialAccountId) throw new WebhookRejected("creator wallet is already linked to a different Monime account");

    let account: FinancialAccount;
    try {
      account = await this.monime.getFinancialAccount(accountId);
    } catch (err) {
      throw new WebhookRetryLater(err instanceof MonimeApiError ? `couldn't read the account: ${err.code}` : "couldn't read the account");
    }
    if (account.reference !== `creator_${userId}` || account.currency !== "SLE") {
      throw new WebhookRejected("Monime account doesn't match the creator wallet");
    }
    await this.repos.wallets.markActive(userId, { id: account.id, uvan: account.uvan }, this.now());
    logger.info("creator wallet linked from the account-created webhook", { userId });
    return { status: "processed" };
  }

  async getWallet(actor: Actor): Promise<WalletDTO> {
    const wallet = await this.repos.wallets.findByUserId(actor.userId);
    if (!wallet) return { status: "missing", ready: false, attempts: 0 };
    return { status: wallet.status, ready: wallet.status === "active", attempts: wallet.attempts };
  }

  /** Owner-triggered retry from the dashboard (the cron does the same in the background). */
  async retryForActor(actor: Actor): Promise<WalletDTO> {
    const wallet = await this.provisionForCreator(actor.userId);
    return { status: wallet.status, ready: wallet.status === "active", attempts: wallet.attempts };
  }
}

function creatorIdFromReference(reference: unknown): string | null {
  if (typeof reference !== "string" || !reference.startsWith("creator_")) return null;
  const userId = reference.slice("creator_".length);
  return isUuid(userId) ? userId : null;
}
