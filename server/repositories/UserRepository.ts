import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { accounts, passwordResetTokens, users, verificationTokens, type NewUser, type Role, type User, type UserStatus } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

export type UserAuthState = Pick<User, "id" | "role" | "status" | "sessionVersion" | "emailVerified">;

export class UserRepository extends BaseRepository {
  async findById(id: string, tx?: Executor): Promise<User | null> {
    const [row] = await this.exec(tx).select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }

  /** `email` must already be normalised (trimmed, lowercased). */
  async findByEmail(email: string, tx?: Executor): Promise<User | null> {
    const [row] = await this.exec(tx).select().from(users).where(eq(users.email, email)).limit(1);
    return row ?? null;
  }

  /** The narrow row the DAL checks on every request. */
  async findAuthState(id: string, tx?: Executor): Promise<UserAuthState | null> {
    const [row] = await this.exec(tx)
      .select({
        id: users.id,
        role: users.role,
        status: users.status,
        sessionVersion: users.sessionVersion,
        emailVerified: users.emailVerified,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row ?? null;
  }

  /** Insert unless the email is taken. Returns null on conflict (no error, no enumeration). */
  async insertIfEmailFree(
    data: Pick<NewUser, "email" | "name" | "passwordHash">,
    tx?: Executor,
  ): Promise<User | null> {
    const [row] = await this.exec(tx)
      .insert(users)
      .values(data)
      .onConflictDoNothing({ target: users.email })
      .returning();
    return row ?? null;
  }

  async recordLoginSuccess(id: string, tx?: Executor): Promise<void> {
    await this.exec(tx).update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, id));
  }

  /** Atomically increments the failure counter and returns the new count. */
  async incrementFailedLogins(id: string, tx?: Executor): Promise<number> {
    const [row] = await this.exec(tx)
      .update(users)
      .set({ failedLoginCount: sql`${users.failedLoginCount} + 1` })
      .where(eq(users.id, id))
      .returning({ count: users.failedLoginCount });
    return row?.count ?? 0;
  }

  async setLockedUntil(id: string, lockedUntil: Date, tx?: Executor): Promise<void> {
    await this.exec(tx).update(users).set({ lockedUntil }).where(eq(users.id, id));
  }

  /** Set a new password, clear lockout and revoke every existing session. */
  async setPasswordHash(id: string, passwordHash: string, tx?: Executor): Promise<void> {
    await this.exec(tx)
      .update(users)
      .set({
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
        sessionVersion: sql`${users.sessionVersion} + 1`,
      })
      .where(eq(users.id, id));
  }

  async bumpSessionVersion(id: string, tx?: Executor): Promise<void> {
    await this.exec(tx)
      .update(users)
      .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, id));
  }

  /** Sets emailVerified if it isn't already. Returns true when this call verified it. */
  async markEmailVerified(id: string, at: Date, tx?: Executor): Promise<boolean> {
    const rows = await this.exec(tx)
      .update(users)
      .set({ emailVerified: at })
      .where(and(eq(users.id, id), isNull(users.emailVerified)))
      .returning({ id: users.id });
    return rows.length > 0;
  }

  /** Changing status always revokes sessions, so a suspension takes effect on the next request. */
  async setStatus(id: string, status: UserStatus, tx?: Executor): Promise<void> {
    await this.exec(tx)
      .update(users)
      .set({ status, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, id));
  }

  /** Role changes revoke sessions so the new role (and step-up) apply immediately. */
  async setRole(id: string, role: Role, tx?: Executor): Promise<void> {
    await this.exec(tx)
      .update(users)
      .set({ role, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, id));
  }

  /**
   * Account erasure: the row stays (money and audit records point at it) but nothing personal is
   * left. The email becomes an unroutable placeholder, so the real address can sign up again.
   */
  async anonymise(id: string, tx?: Executor): Promise<void> {
    await this.exec(tx)
      .update(users)
      .set({
        email: `deleted+${id}@users.invalid`,
        name: null,
        image: null,
        passwordHash: null,
        emailVerified: null,
        failedLoginCount: 0,
        lockedUntil: null,
        status: "closed",
        sessionVersion: sql`${users.sessionVersion} + 1`,
      })
      .where(eq(users.id, id));
  }

  /** Google (and any other) sign-in links, plus outstanding emailed tokens. */
  async deleteSignInLinks(id: string, tx?: Executor): Promise<void> {
    const db = this.exec(tx);
    await db.delete(accounts).where(eq(accounts.userId, id));
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, id));
    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, id));
  }

}
