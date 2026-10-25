import "server-only";
import { and, desc, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import {
  adminAuthEvents,
  adminInvites,
  adminRecoveryCodes,
  admins,
  adminSessions,
  type Admin,
  type AdminAuthEventType,
  type AdminInvite,
  type AdminSession,
  type AdminStatus,
} from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

// Admin accounts, sessions, recovery codes and invites. Every state change that could race
// (invite claims, recovery codes, TOTP steps, session touch/revoke, failed logins) is one
// conditional UPDATE … RETURNING: zero rows back means another request got there first.

export class AdminAccountRepository extends BaseRepository {
  // ── Accounts ──────────────────────────────────────────────────────────────────

  async findById(id: string, tx?: Executor): Promise<Admin | null> {
    const [row] = await this.exec(tx).select().from(admins).where(eq(admins.id, id)).limit(1);
    return row ?? null;
  }

  /** Row-locks the admin: serialises status, password and role changes per account. */
  async lockById(id: string, tx: Executor): Promise<Admin | null> {
    const [row] = await tx.select().from(admins).where(eq(admins.id, id)).for("update").limit(1);
    return row ?? null;
  }

  /** `email` must already be normalised (trimmed, lowercased). */
  async findByEmail(email: string, tx?: Executor): Promise<Admin | null> {
    const [row] = await this.exec(tx).select().from(admins).where(eq(admins.email, email)).limit(1);
    return row ?? null;
  }

  /** Null when the email is taken. */
  async insert(data: Pick<typeof admins.$inferInsert, "email" | "name" | "passwordHash">, tx?: Executor): Promise<Admin | null> {
    const [row] = await this.exec(tx).insert(admins).values(data).onConflictDoNothing({ target: admins.email }).returning();
    return row ?? null;
  }

  async list(tx?: Executor) {
    return this.exec(tx)
      .select({
        id: admins.id,
        email: admins.email,
        name: admins.name,
        status: admins.status,
        totpEnabledAt: admins.totpEnabledAt,
        lastLoginAt: admins.lastLoginAt,
        createdAt: admins.createdAt,
      })
      .from(admins)
      .orderBy(admins.status, admins.email);
  }

  /** Atomically increments the failure counter and returns the new count. */
  async incrementFailedLogins(id: string, tx?: Executor): Promise<number> {
    const [row] = await this.exec(tx)
      .update(admins)
      .set({ failedLoginCount: sql`${admins.failedLoginCount} + 1` })
      .where(eq(admins.id, id))
      .returning({ count: admins.failedLoginCount });
    return row?.count ?? 0;
  }

  /** Never shortens a lockout: failed logins finishing out of order can't replace a longer one. */
  async setLockedUntil(id: string, lockedUntil: Date, tx?: Executor): Promise<void> {
    const until = sql`${lockedUntil.toISOString()}::timestamptz`;
    await this.exec(tx)
      .update(admins)
      .set({ lockedUntil: sql`greatest(coalesce(${admins.lockedUntil}, ${until}), ${until})` })
      .where(eq(admins.id, id));
  }

  /** Lifts a lockout and clears the failure counter (staff unlock). */
  async clearLockout(id: string, tx?: Executor): Promise<void> {
    await this.exec(tx).update(admins).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(admins.id, id));
  }

  /**
   * Break-glass for a lost authenticator: clears the TOTP secret and every recovery code, so the
   * admin enrolls again at their next sign-in. Bumps sessionVersion (revokes sessions and step-up).
   */
  async resetSecondFactor(id: string, tx: Executor): Promise<void> {
    await tx
      .update(admins)
      .set({
        totpSecretEnc: null,
        totpPendingSecretEnc: null,
        totpEnabledAt: null,
        totpLastCounter: null,
        failedLoginCount: 0,
        lockedUntil: null,
        sessionVersion: sql`${admins.sessionVersion} + 1`,
      })
      .where(eq(admins.id, id));
    await tx.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.adminId, id));
  }

  async recordLoginSuccess(id: string, at: Date, tx?: Executor): Promise<void> {
    await this.exec(tx).update(admins).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: at }).where(eq(admins.id, id));
  }

  /** Store a secret to confirm on /2fa/setup. Only while TOTP isn't enabled yet. */
  async setPendingTotpSecret(id: string, secretEnc: string, tx?: Executor): Promise<boolean> {
    const rows = await this.exec(tx)
      .update(admins)
      .set({ totpPendingSecretEnc: secretEnc })
      .where(and(eq(admins.id, id), isNull(admins.totpEnabledAt)))
      .returning({ id: admins.id });
    return rows.length > 0;
  }

  /**
   * Promote the pending secret once a code from it was accepted. Guarded on the exact pending
   * value, so two tabs enrolling different secrets can't end with a secret nobody confirmed.
   */
  async enableTotp(id: string, pendingSecretEnc: string, counter: number, at: Date, tx?: Executor): Promise<boolean> {
    const rows = await this.exec(tx)
      .update(admins)
      .set({ totpSecretEnc: pendingSecretEnc, totpPendingSecretEnc: null, totpEnabledAt: at, totpLastCounter: counter })
      .where(and(eq(admins.id, id), isNull(admins.totpEnabledAt), eq(admins.totpPendingSecretEnc, pendingSecretEnc)))
      .returning({ id: admins.id });
    return rows.length > 0;
  }

  /** Replay guard: true only for the first request to use a time step newer than the last one. */
  async claimTotpCounter(id: string, counter: number, tx?: Executor): Promise<boolean> {
    const rows = await this.exec(tx)
      .update(admins)
      .set({ totpLastCounter: counter })
      .where(and(eq(admins.id, id), or(isNull(admins.totpLastCounter), lt(admins.totpLastCounter, counter))))
      .returning({ id: admins.id });
    return rows.length > 0;
  }

  /** Status changes always revoke sessions (session_version bump in the same statement). */
  async setStatus(id: string, status: AdminStatus, tx?: Executor): Promise<void> {
    await this.exec(tx)
      .update(admins)
      .set({ status, sessionVersion: sql`${admins.sessionVersion} + 1` })
      .where(eq(admins.id, id));
  }

  /**
   * Set a new password and revoke every session. With `expectedHash` nothing is written if the
   * password changed meanwhile. Returns whether it was written.
   */
  async setPasswordHash(id: string, passwordHash: string, tx?: Executor, opts: { expectedHash?: string } = {}): Promise<boolean> {
    const rows = await this.exec(tx)
      .update(admins)
      .set({ passwordHash, failedLoginCount: 0, lockedUntil: null, sessionVersion: sql`${admins.sessionVersion} + 1` })
      .where(and(eq(admins.id, id), opts.expectedHash !== undefined ? eq(admins.passwordHash, opts.expectedHash) : undefined))
      .returning({ id: admins.id });
    return rows.length > 0;
  }

  async bumpSessionVersion(id: string, tx?: Executor): Promise<void> {
    await this.exec(tx)
      .update(admins)
      .set({ sessionVersion: sql`${admins.sessionVersion} + 1` })
      .where(eq(admins.id, id));
  }

  // ── Sessions ──────────────────────────────────────────────────────────────────

  async insertSession(data: Pick<typeof adminSessions.$inferInsert, "adminId" | "tokenHash" | "sessionVersion" | "expiresAt" | "ipHash" | "userAgent">, tx?: Executor): Promise<AdminSession> {
    const [row] = await this.exec(tx).insert(adminSessions).values(data).returning();
    return row!;
  }

  /** The session behind a cookie with its admin, if it's still live. */
  async findLiveSession(tokenHash: string, now: Date, tx?: Executor): Promise<{ session: AdminSession; admin: Admin } | null> {
    const [row] = await this.exec(tx)
      .select({ session: adminSessions, admin: admins })
      .from(adminSessions)
      .innerJoin(admins, eq(admins.id, adminSessions.adminId))
      .where(and(eq(adminSessions.tokenHash, tokenHash), isNull(adminSessions.revokedAt), gt(adminSessions.expiresAt, now)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Extend the idle window. One throttled statement: at most one write a minute per session, and
   * a revoked or expired session is never revived. The absolute cap is the caller's `maxExpiry`.
   */
  async touchSession(id: string, now: Date, idleExpiry: Date, tx?: Executor): Promise<void> {
    const at = sql`${now.toISOString()}::timestamptz`;
    await this.exec(tx)
      .update(adminSessions)
      .set({ lastSeenAt: now, expiresAt: sql`least(${idleExpiry.toISOString()}::timestamptz, ${adminSessions.createdAt} + interval '12 hours')` })
      .where(and(eq(adminSessions.id, id), isNull(adminSessions.revokedAt), gt(adminSessions.expiresAt, now), lt(adminSessions.lastSeenAt, sql`${at} - interval '1 minute'`)));
  }

  async revokeSession(id: string, adminId: string, now: Date, tx?: Executor): Promise<boolean> {
    const rows = await this.exec(tx)
      .update(adminSessions)
      .set({ revokedAt: now })
      .where(and(eq(adminSessions.id, id), eq(adminSessions.adminId, adminId), isNull(adminSessions.revokedAt)))
      .returning({ id: adminSessions.id });
    return rows.length > 0;
  }

  async revokeAllSessions(adminId: string, now: Date, tx?: Executor, opts: { exceptId?: string } = {}): Promise<void> {
    await this.exec(tx)
      .update(adminSessions)
      .set({ revokedAt: now })
      .where(and(eq(adminSessions.adminId, adminId), isNull(adminSessions.revokedAt), opts.exceptId ? ne(adminSessions.id, opts.exceptId) : undefined));
  }

  async listLiveSessions(adminId: string, now: Date, tx?: Executor) {
    return this.exec(tx)
      .select({ id: adminSessions.id, createdAt: adminSessions.createdAt, lastSeenAt: adminSessions.lastSeenAt, userAgent: adminSessions.userAgent })
      .from(adminSessions)
      .where(and(eq(adminSessions.adminId, adminId), isNull(adminSessions.revokedAt), gt(adminSessions.expiresAt, now)))
      .orderBy(desc(adminSessions.lastSeenAt));
  }

  // ── Recovery codes ────────────────────────────────────────────────────────────

  async replaceRecoveryCodes(adminId: string, codeHashes: string[], tx: Executor): Promise<void> {
    await tx.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.adminId, adminId));
    if (codeHashes.length) await tx.insert(adminRecoveryCodes).values(codeHashes.map((codeHash) => ({ adminId, codeHash })));
  }

  /** Single use: true only for the request that marked it used. */
  async useRecoveryCode(adminId: string, codeHash: string, now: Date, tx?: Executor): Promise<boolean> {
    const rows = await this.exec(tx)
      .update(adminRecoveryCodes)
      .set({ usedAt: now })
      .where(and(eq(adminRecoveryCodes.adminId, adminId), eq(adminRecoveryCodes.codeHash, codeHash), isNull(adminRecoveryCodes.usedAt)))
      .returning({ id: adminRecoveryCodes.id });
    return rows.length > 0;
  }

  async unusedRecoveryCodes(adminId: string, tx?: Executor): Promise<number> {
    const [row] = await this.exec(tx)
      .select({ n: sql<number>`count(*)::int` })
      .from(adminRecoveryCodes)
      .where(and(eq(adminRecoveryCodes.adminId, adminId), isNull(adminRecoveryCodes.usedAt)));
    return row?.n ?? 0;
  }

  // ── Invites ───────────────────────────────────────────────────────────────────

  /**
   * Replace any open invite for the address and create a new one, in the caller's transaction.
   * The partial unique index (one open invite per email) turns a concurrent re-invite into a
   * unique violation instead of two live links.
   */
  async replaceInvite(data: Pick<typeof adminInvites.$inferInsert, "email" | "tokenHash" | "roleIds" | "invitedBy" | "expiresAt">, now: Date, tx: Executor): Promise<AdminInvite> {
    await tx
      .update(adminInvites)
      .set({ revokedAt: now })
      .where(and(eq(adminInvites.email, data.email), isNull(adminInvites.acceptedAt), isNull(adminInvites.revokedAt)));
    const [row] = await tx.insert(adminInvites).values(data).returning();
    return row!;
  }

  async findOpenInvite(tokenHash: string, now: Date, tx?: Executor): Promise<AdminInvite | null> {
    const [row] = await this.exec(tx)
      .select()
      .from(adminInvites)
      .where(and(eq(adminInvites.tokenHash, tokenHash), isNull(adminInvites.acceptedAt), isNull(adminInvites.revokedAt), gt(adminInvites.expiresAt, now)))
      .limit(1);
    return row ?? null;
  }

  /** Claims the invite: only one request can accept a link. */
  async claimInvite(tokenHash: string, now: Date, tx: Executor): Promise<AdminInvite | null> {
    const [row] = await tx
      .update(adminInvites)
      .set({ acceptedAt: now })
      .where(and(eq(adminInvites.tokenHash, tokenHash), isNull(adminInvites.acceptedAt), isNull(adminInvites.revokedAt), gt(adminInvites.expiresAt, now)))
      .returning();
    return row ?? null;
  }

  async revokeInvite(id: string, now: Date, tx?: Executor): Promise<AdminInvite | null> {
    const [row] = await this.exec(tx)
      .update(adminInvites)
      .set({ revokedAt: now })
      .where(and(eq(adminInvites.id, id), isNull(adminInvites.acceptedAt), isNull(adminInvites.revokedAt)))
      .returning();
    return row ?? null;
  }

  async listOpenInvites(now: Date, tx?: Executor) {
    return this.exec(tx)
      .select()
      .from(adminInvites)
      .where(and(isNull(adminInvites.acceptedAt), isNull(adminInvites.revokedAt), gt(adminInvites.expiresAt, now)))
      .orderBy(desc(adminInvites.createdAt));
  }

  // ── Security log ──────────────────────────────────────────────────────────────

  /** An admin's recent sign-in and security events, newest first. */
  async listEvents(adminId: string, limit = 50, tx?: Executor) {
    return this.exec(tx)
      .select({ id: adminAuthEvents.id, type: adminAuthEvents.type, userAgent: adminAuthEvents.userAgent, createdAt: adminAuthEvents.createdAt })
      .from(adminAuthEvents)
      .where(eq(adminAuthEvents.adminId, adminId))
      .orderBy(desc(adminAuthEvents.createdAt))
      .limit(Math.min(limit, 200));
  }

  async appendEvent(data: { adminId: string | null; type: AdminAuthEventType; ipHash: string | null; userAgent: string | null }, tx?: Executor): Promise<void> {
    await this.exec(tx).insert(adminAuthEvents).values(data);
  }
}
