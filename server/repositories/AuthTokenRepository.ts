import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { passwordResetTokens, verificationTokens } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

/** Single-use emailed tokens. Only SHA-256 hashes are stored. */
export class AuthTokenRepository extends BaseRepository {
  /** Replace any outstanding email-verification token for the user. */
  async replaceVerificationToken(userId: string, tokenHash: string, expires: Date, tx?: Executor) {
    const db = this.exec(tx);
    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, userId));
    await db.insert(verificationTokens).values({ identifier: userId, token: tokenHash, expires });
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

  /** Invalidate the user's unused reset tokens, then store a new one. */
  async replacePasswordResetToken(userId: string, tokenHash: string, expiresAt: Date, tx?: Executor) {
    const db = this.exec(tx);
    await db
      .delete(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
    await db.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt });
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
