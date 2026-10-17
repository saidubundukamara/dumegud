import "server-only";
import { maxWithdrawableMinor } from "@/lib/phone";
import { availableBalanceMinor, type MonimeClient } from "@/server/integrations/monime";
import { logger } from "@/server/lib/logger";
import type { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import type { LedgerRepository } from "@/server/repositories/LedgerRepository";
import type { PaymentRepository } from "@/server/repositories/PaymentRepository";
import { accounts } from "./ledger";
import type { PlatformSettingsService } from "./PlatformSettingsService";

export type BalanceDTO = {
  /** What we can say for sure (for display). */
  displayMinor: number;
  /** min(Monime live, ledger); null when Monime couldn't be read (withdrawals refuse). */
  availableMinor: number | null;
  maxWithdrawableMinor: number;
  /** Settled support/sales still on their way to the wallet. */
  pendingMinor: number;
  payoutFeeBps: number;
  /** True when the live balance couldn't be read and the figure may be out of date. */
  stale: boolean;
};

/**
 * Creator balance (implementation.md §3.4, Phase 6). Never cached across requests.
 * Withdrawable = min(Monime's live balance, our ledger): either can lag or be wrong, and the
 * smaller one is safe. If Monime can't be read, withdrawals fail closed; display falls back to
 * the ledger with an "updating" flag.
 */
export class BalanceService {
  constructor(
    private readonly repos: { wallets: CreatorWalletRepository; ledger: LedgerRepository; payments: PaymentRepository },
    private readonly monime: MonimeClient,
    private readonly settings: Pick<PlatformSettingsService, "get">,
  ) {}

  async getBalance(creatorId: string): Promise<BalanceDTO> {
    const [wallet, ledger, pending, settings] = await Promise.all([
      this.repos.wallets.findByUserId(creatorId),
      this.repos.ledger.balance(accounts.creatorWallet(creatorId)),
      this.repos.payments.pendingTransferTotal(creatorId),
      this.settings.get(),
    ]);
    let live: number | null = null;
    if (wallet?.status === "active" && wallet.monimeFinancialAccountId) {
      try {
        live = availableBalanceMinor(await this.monime.getFinancialAccount(wallet.monimeFinancialAccountId));
      } catch (err) {
        logger.warn("live wallet balance unavailable", { creatorId, err });
      }
    }
    const available = live === null ? null : Math.max(0, Math.min(live, ledger));
    if (live !== null && live !== ledger) logger.warn("wallet balance drift", { creatorId, live, ledger });
    return {
      displayMinor: available ?? Math.max(0, ledger),
      availableMinor: available,
      maxWithdrawableMinor: available === null ? 0 : maxWithdrawableMinor(available, settings.payoutFeeBpsEstimate),
      pendingMinor: pending,
      payoutFeeBps: settings.payoutFeeBpsEstimate,
      stale: live === null,
    };
  }

  /** Wallet history lines (earnings in, withdrawals out) from the ledger. */
  async history(creatorId: string) {
    return this.repos.ledger.history(accounts.creatorWallet(creatorId), 30);
  }
}
