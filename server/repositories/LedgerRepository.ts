import "server-only";
import { and, desc, eq, gte, like, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { ledgerEntries, ledgerJournals } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

export type JournalInput = {
  idempotencyKey: string;
  kind: string;
  paymentId: string | null;
  memo?: string;
  lines: { account: string; amountMinor: number }[];
};

export class LedgerRepository extends BaseRepository {
  /** Insert a journal and its lines unless the key exists. Returns true if it was written now. */
  async postJournal(input: JournalInput, tx: Executor): Promise<boolean> {
    const [journal] = await tx
      .insert(ledgerJournals)
      .values({ idempotencyKey: input.idempotencyKey, kind: input.kind, paymentId: input.paymentId, memo: input.memo })
      .onConflictDoNothing({ target: ledgerJournals.idempotencyKey })
      .returning({ id: ledgerJournals.id });
    if (!journal) return false;
    await tx.insert(ledgerEntries).values(input.lines.map((l) => ({ journalId: journal.id, ...l })));
    return true;
  }

  /** Signed balance (debits − credits) of one account. */
  async balance(account: string, tx?: Executor): Promise<number> {
    const [row] = await this.exec(tx)
      .select({ total: sql<string>`coalesce(sum(${ledgerEntries.amountMinor}), 0)` })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.account, account));
    return Number(row?.total ?? 0);
  }

  /** ledger-drift cron: creators whose wallet account had ledger activity since `since`. */
  async walletsChangedSince(since: Date, limit: number, tx?: Executor): Promise<string[]> {
    const rows = await this.exec(tx)
      .selectDistinct({ account: ledgerEntries.account })
      .from(ledgerEntries)
      .where(and(like(ledgerEntries.account, "creator\\_wallet:%"), gte(ledgerEntries.createdAt, since)))
      .limit(limit);
    return rows.map((r) => r.account.slice("creator_wallet:".length));
  }

  /** Recent lines on one account with their journal kind (wallet history). */
  async history(account: string, limit = 50, tx?: Executor) {
    return this.exec(tx)
      .select({ amountMinor: ledgerEntries.amountMinor, kind: ledgerJournals.kind, paymentId: ledgerJournals.paymentId, at: ledgerEntries.createdAt })
      .from(ledgerEntries)
      .innerJoin(ledgerJournals, eq(ledgerJournals.id, ledgerEntries.journalId))
      .where(eq(ledgerEntries.account, account))
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(Math.min(limit, 100));
  }
}
