import "server-only";
import { and, eq, gt, isNotNull, isNull, lt, or } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { passwordResetTokens, users, verificationTokens } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

/** Single-use emailed tokens. Only SHA-256 hashes are stored. */
export class AuthTokenRepository extends BaseRepository {
  /**
   * Delete-then-insert under the user's row lock: two concurrent requests would otherwise both
   * delete before either inserts and leave two live links.
   */
  private replaceLocked(userId: string, tx: Executor | undefined, fn: (db: Executor) => Promise<void>) {
    const run = async (db: Executor) => {
      await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      await fn(db);
    };
    return tx ? run(tx) : this.exec().transaction(run);
  }

  /** Replace any outstanding email-verification token for the user. */
  async replaceVerificationToken(userId: string, tokenHash: string, expires: Date, tx?: Executor) {
    await this.replaceLocked(userId, tx, async (db) => {
      await db.delete(verificationTokens).where(eq(verificationTokens.identifier, userId));
      await db.insert(verificationTokens).values({ identifier: userId, token: tokenHash, expires });
    });
  }

  /** Delete the token and return its user id, or null if it doesn't exist or has expired. */
  async consumeVerificationToken(tokenHash: string, now: Date, tx?: Executor): Promise<string | null> {
    const [row] = await this.exec(tx)
      .delete(verificationTokens)
      .where(eq(verificationTokens.token, tokenHash))
      .returning();
    if (!row || row.expires <= now) return null;
    return row.identifier;
  }

  /** cleanup cron: expired verification tokens, and reset tokens expired or used before `usedBefore`. */
  async purgeExpired(now: Date, usedBefore: Date, tx?: Executor): Promise<number> {
    const db = this.exec(tx);
    const verification = await db
      .delete(verificationTokens)
      .where(lt(verificationTokens.expires, now))
      .returning({ token: verificationTokens.token });
    const resets = await db
      .delete(passwordResetTokens)
      .where(or(lt(passwordResetTokens.expiresAt, now), and(isNotNull(passwordResetTokens.usedAt), lt(passwordResetTokens.usedAt, usedBefore))))
      .returning({ id: passwordResetTokens.id });
    return verification.length + resets.length;
  }

  /** Invalidate the user's unused reset tokens, then store a new one. */
  async replacePasswordResetToken(userId: string, tokenHash: string, expiresAt: Date, tx?: Executor) {
    await this.replaceLocked(userId, tx, async (db) => {
      await this.invalidateUnusedResetTokens(userId, db);
      await db.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt });
    });
  }

  /** After a reset succeeds, any other link the user was sent must stop working. */
  async invalidateUnusedResetTokens(userId: string, tx?: Executor): Promise<void> {
    await this.exec(tx)
      .delete(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
  }

  /**
   * Mark a reset token used and return its user id. The conditional UPDATE makes it single-use
   * even under concurrent submissions.
   */
  async consumePasswordResetToken(tokenHash: string, now: Date, tx?: Executor): Promise<string | null> {
    const [row] = await this.exec(tx)
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .returning({ userId: passwordResetTokens.userId });
    return row?.userId ?? null;
  }
}
