import "server-only";
import { z } from "zod";
import { isAdminPermission } from "@/lib/admin-permissions";
import type { Admin, AdminAuthEventType } from "@/server/db/schema";
import { decryptField, encryptField, randomToken, sha256 } from "@/server/lib/crypto";
import { ConflictError, ValidationError } from "@/server/lib/errors";
import { pepperedHash } from "@/server/lib/hash";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/server/lib/password";
import { enforceRateLimit, type RateLimitPolicy } from "@/server/lib/rate-limit";
import { generateRecoveryCodes, generateTotpSecret, matchTotp, normaliseRecoveryCode, otpauthUrl } from "@/server/lib/totp";
import type { AdminAccountRepository } from "@/server/repositories/AdminAccountRepository";
import type { AdminRoleRepository } from "@/server/repositories/AdminRoleRepository";
import { newPasswordSchema } from "@/server/validation/auth";
import { adminActor, type AdminActor, type RequestContext } from "./actor";
import { lockoutUntil } from "./AuthService";
import type { AuditLogger } from "./compliance";
import { runInTransaction, type Tx } from "./transaction";

// Admin sign-in (separate from creators' Auth.js): password, then a TOTP or recovery code, then
// a DB-backed session. Every step that could be replayed or raced is a single conditional UPDATE
// in the repository (TOTP time step, recovery code, enrollment, session touch/revoke).

export const ADMIN_SESSION_IDLE_MS = 30 * 60_000;
/** Matches the `12 hours` cap in AdminAccountRepository.touchSession. */
export const ADMIN_SESSION_ABSOLUTE_MS = 12 * 60 * 60_000;

const loginSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()), password: z.string().min(1).max(200) });

/** Who passed the password step (carried in a short signed cookie until the second factor). */
export type PendingAdmin = { adminId: string; sessionVersion: number };

export type ResolvedAdminSession = {
  actor: AdminActor;
  sessionId: string;
  sessionVersion: number;
  admin: { id: string; email: string; name: string };
  roleNames: string[];
};

type Repos = { adminAccounts: AdminAccountRepository; adminRoles: AdminRoleRepository };

export type AdminAuthServiceDeps = {
  repos: Repos;
  audit: AuditLogger;
  now?: () => Date;
  rateLimit?: (policy: RateLimitPolicy, identifier: string) => Promise<void>;
  transaction?: typeof runInTransaction;
};

const recoveryHash = (code: string) => pepperedHash("admin-recovery", normaliseRecoveryCode(code));

export class AdminAuthService {
  private readonly repos: Repos;
  private readonly now: () => Date;
  private readonly rateLimit: (policy: RateLimitPolicy, identifier: string) => Promise<void>;
  private readonly transaction: typeof runInTransaction;

  constructor(private readonly deps: AdminAuthServiceDeps) {
    this.repos = deps.repos;
    this.now = deps.now ?? (() => new Date());
    this.rateLimit = deps.rateLimit ?? enforceRateLimit;
    this.transaction = deps.transaction ?? runInTransaction;
  }

  // ── Step 1: password ──────────────────────────────────────────────────────────

  /** Null for any failure (one message for all, so nothing reveals which part was wrong). */
  async verifyPassword(raw: unknown, ctx: RequestContext): Promise<(PendingAdmin & { needsEnrollment: boolean }) | null> {
    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) return null;
    const { email, password } = parsed.data;
    await this.rateLimit("admin-login:ip", ctx.ip);
    await this.rateLimit("admin-login:email", email);

    const now = this.now();
    const admin = await this.repos.adminAccounts.findByEmail(email);
    if (!admin || !this.canSignIn(admin, now)) {
      await verifyAgainstDummy(password);
      await this.event(admin?.id ?? null, "login_failed", ctx);
      return null;
    }
    if (!(await verifyPassword(admin.passwordHash, password))) {
      await this.recordFailure(admin.id, now, "login_failed", ctx);
      return null;
    }
    // Failures reset only after the second factor: a known password alone doesn't clear them.
    await this.event(admin.id, "login_password_ok", ctx);
    return { adminId: admin.id, sessionVersion: admin.sessionVersion, needsEnrollment: admin.totpEnabledAt === null };
  }

  // ── Step 2: TOTP or recovery code ─────────────────────────────────────────────

  /** Returns the new session's raw token, or null (wrong/reused code, account changed). */
  async verifySecondFactor(pending: PendingAdmin, code: string, ctx: RequestContext): Promise<{ token: string } | null> {
    await this.rateLimit("admin-2fa:admin", pending.adminId);
    const now = this.now();
    const admin = await this.pendingAdmin(pending, now);
    if (!admin?.totpSecretEnc) return null;

    const isRecovery = /[a-z]/i.test(code);
    const ok = isRecovery
      ? await this.repos.adminAccounts.useRecoveryCode(admin.id, recoveryHash(code), now)
      : await this.claimTotp(admin, code, now);
    if (!ok) {
      await this.recordFailure(admin.id, now, "totp_failed", ctx);
      return null;
    }
    if (isRecovery) await this.event(admin.id, "recovery_code_used", ctx);
    const token = await this.transaction(async (tx) => {
      await this.repos.adminAccounts.recordLoginSuccess(admin.id, now, tx);
      return this.createSession(admin, ctx, now, tx);
    });
    await this.event(admin.id, "login_success", ctx);
    return { token };
  }

  // ── First sign-in: TOTP enrollment ────────────────────────────────────────────

  /**
   * The secret to show on /2fa/setup. Set only if none is pending, then re-read, so two tabs show
   * the same QR code instead of each overwriting the other's.
   */
  async enrollmentSecret(pending: PendingAdmin): Promise<{ secret: string; otpauthUrl: string } | null> {
    const admin = await this.pendingAdmin(pending, this.now());
    if (!admin || admin.totpEnabledAt) return null;
    let enc = admin.totpPendingSecretEnc;
    if (!enc) {
      await this.repos.adminAccounts.setPendingTotpSecret(admin.id, encryptField(generateTotpSecret()));
      enc = (await this.repos.adminAccounts.findById(admin.id))?.totpPendingSecretEnc ?? null;
    }
    if (!enc) return null;
    const secret = decryptField(enc);
    return { secret, otpauthUrl: otpauthUrl(secret, admin.email) };
  }

  /** Confirms the pending secret with a code from it; returns the session and the recovery codes (shown once). */
  async confirmEnrollment(pending: PendingAdmin, code: string, ctx: RequestContext): Promise<{ token: string; recoveryCodes: string[] } | null> {
    await this.rateLimit("admin-2fa:admin", pending.adminId);
    const now = this.now();
    const admin = await this.pendingAdmin(pending, now);
    if (!admin || admin.totpEnabledAt || !admin.totpPendingSecretEnc) return null;
    const counter = matchTotp(decryptField(admin.totpPendingSecretEnc), code, now);
    if (counter === null) {
      await this.recordFailure(admin.id, now, "totp_failed", ctx);
      return null;
    }
    const recoveryCodes = generateRecoveryCodes();
    const token = await this.transaction(async (tx) => {
      // Guarded on the exact pending secret: a concurrent confirm (or a new secret) makes this a no-op.
      if (!(await this.repos.adminAccounts.enableTotp(admin.id, admin.totpPendingSecretEnc!, counter, now, tx))) return null;
      await this.repos.adminAccounts.replaceRecoveryCodes(admin.id, recoveryCodes.map(recoveryHash), tx);
      await this.repos.adminAccounts.recordLoginSuccess(admin.id, now, tx);
      return this.createSession(admin, ctx, now, tx);
    });
    if (!token) return null;
    await this.event(admin.id, "totp_enrolled", ctx);
    await this.deps.audit.log({ actor: await this.actorFor(admin.id), action: "admin.totp_enrolled", targetType: "admin", targetId: admin.id });
    return { token, recoveryCodes };
  }

  // ── Sessions ──────────────────────────────────────────────────────────────────

  /** The live session behind a cookie, with the admin's current roles and permissions. */
  async resolveSession(token: string): Promise<ResolvedAdminSession | null> {
    const now = this.now();
    const found = await this.repos.adminAccounts.findLiveSession(sha256(token), now);
    if (!found) return null;
    const { session, admin } = found;
    if (admin.status !== "active" || admin.totpEnabledAt === null || session.sessionVersion !== admin.sessionVersion) return null;
    const grants = await this.repos.adminRoles.grantsFor(admin.id);
    // Throttled in SQL (≤ 1 write a minute) and never revives a revoked session.
    await this.repos.adminAccounts.touchSession(session.id, now, new Date(now.getTime() + ADMIN_SESSION_IDLE_MS));
    return {
      actor: adminActor(admin.id, grants.roles.map((r) => r.key), grants.permissions.filter(isAdminPermission)),
      sessionId: session.id,
      sessionVersion: admin.sessionVersion,
      admin: { id: admin.id, email: admin.email, name: admin.name },
      roleNames: grants.roles.map((r) => r.name),
    };
  }

  async logout(token: string, ctx: RequestContext): Promise<void> {
    const found = await this.repos.adminAccounts.findLiveSession(sha256(token), this.now());
    if (!found) return;
    await this.repos.adminAccounts.revokeSession(found.session.id, found.admin.id, this.now());
    await this.event(found.admin.id, "logout", ctx);
  }

  async listSessions(actor: AdminActor) {
    return this.repos.adminAccounts.listLiveSessions(actor.adminId, this.now());
  }

  async revokeOwnSession(actor: AdminActor, sessionId: string, ctx: RequestContext): Promise<void> {
    if (await this.repos.adminAccounts.revokeSession(sessionId, actor.adminId, this.now())) {
      await this.event(actor.adminId, "session_revoked", ctx);
    }
  }

  // ── Step-up, password, recovery codes ─────────────────────────────────────────

  /** A fresh TOTP code (single use, shared replay guard with sign-in) unlocks sensitive actions. */
  async confirmStepUp(actor: AdminActor, code: string, ctx: RequestContext): Promise<boolean> {
    await this.rateLimit("admin-2fa:admin", actor.adminId);
    const now = this.now();
    const admin = await this.repos.adminAccounts.findById(actor.adminId);
    const ok = !!admin && admin.status === "active" && (await this.claimTotp(admin, code, now));
    await this.event(actor.adminId, ok ? "step_up_success" : "step_up_failed", ctx);
    await this.deps.audit.log({ actor, action: ok ? "step_up.success" : "step_up.failure", targetType: "admin", targetId: actor.adminId });
    return ok;
  }

  /**
   * Change the password. Every session is revoked (session_version bump) and a new one is made
   * for this browser in the same transaction; returns its token.
   */
  async changePassword(actor: AdminActor, input: { currentPassword: string; newPassword: string }, ctx: RequestContext): Promise<string> {
    const parsed = newPasswordSchema.safeParse(input.newPassword);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Choose a stronger password.");
    const admin = await this.repos.adminAccounts.findById(actor.adminId);
    if (!admin || !(await verifyPassword(admin.passwordHash, input.currentPassword))) throw new ValidationError("Your current password is incorrect.");
    const hash = await hashPassword(parsed.data);
    const now = this.now();
    const token = await this.transaction(async (tx) => {
      if (!(await this.repos.adminAccounts.setPasswordHash(admin.id, hash, tx, { expectedHash: admin.passwordHash }))) return null;
      await this.repos.adminAccounts.revokeAllSessions(admin.id, now, tx);
      const fresh = await this.repos.adminAccounts.findById(admin.id, tx);
      return this.createSession(fresh!, ctx, now, tx);
    });
    if (!token) throw new ConflictError("Your password was changed somewhere else. Sign in again.");
    await this.event(admin.id, "password_changed", ctx);
    await this.deps.audit.log({ actor, action: "admin.password_changed", targetType: "admin", targetId: admin.id });
    return token;
  }

  /** New recovery codes replace every old one (shown once). Needs step-up at the action layer. */
  async regenerateRecoveryCodes(actor: AdminActor): Promise<string[]> {
    const codes = generateRecoveryCodes();
    await this.transaction(async (tx) => {
      const admin = await this.repos.adminAccounts.lockById(actor.adminId, tx);
      if (!admin) throw new ConflictError("This account no longer exists.");
      await this.repos.adminAccounts.replaceRecoveryCodes(admin.id, codes.map(recoveryHash), tx);
    });
    await this.deps.audit.log({ actor, action: "admin.recovery_codes_regenerated", targetType: "admin", targetId: actor.adminId });
    return codes;
  }

  async recoveryCodesLeft(actor: AdminActor): Promise<number> {
    return this.repos.adminAccounts.unusedRecoveryCodes(actor.adminId);
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  private canSignIn(admin: Admin, now: Date): boolean {
    return admin.status === "active" && admin.passwordHash !== "!" && !(admin.lockedUntil && admin.lockedUntil > now);
  }

  /** The admin behind a pending cookie, if nothing about the account changed since step 1. */
  private async pendingAdmin(pending: PendingAdmin, now: Date): Promise<Admin | null> {
    const admin = await this.repos.adminAccounts.findById(pending.adminId);
    if (!admin || admin.sessionVersion !== pending.sessionVersion || !this.canSignIn(admin, now)) return null;
    return admin;
  }

  private async claimTotp(admin: Admin, code: string, now: Date): Promise<boolean> {
    if (!admin.totpSecretEnc) return false;
    const counter = matchTotp(decryptField(admin.totpSecretEnc), code, now);
    return counter !== null && (await this.repos.adminAccounts.claimTotpCounter(admin.id, counter));
  }

  private async recordFailure(adminId: string, now: Date, type: AdminAuthEventType, ctx: RequestContext): Promise<void> {
    const count = await this.repos.adminAccounts.incrementFailedLogins(adminId);
    const until = lockoutUntil(count, now);
    if (until) await this.repos.adminAccounts.setLockedUntil(adminId, until);
    await this.event(adminId, type, ctx);
  }

  private async createSession(admin: Admin, ctx: RequestContext, now: Date, tx: Tx): Promise<string> {
    const token = randomToken();
    await this.repos.adminAccounts.insertSession(
      {
        adminId: admin.id,
        tokenHash: sha256(token),
        sessionVersion: admin.sessionVersion,
        expiresAt: new Date(now.getTime() + ADMIN_SESSION_IDLE_MS),
        ipHash: ctx.ip !== "unknown" ? pepperedHash("ip", ctx.ip) : null,
        userAgent: ctx.userAgent,
      },
      tx,
    );
    return token;
  }

  private async actorFor(adminId: string): Promise<AdminActor> {
    const grants = await this.repos.adminRoles.grantsFor(adminId);
    return adminActor(adminId, grants.roles.map((r) => r.key), grants.permissions.filter(isAdminPermission));
  }

  private async event(adminId: string | null, type: AdminAuthEventType, ctx: RequestContext | null): Promise<void> {
    await this.repos.adminAccounts.appendEvent({
      adminId,
      type,
      ipHash: ctx && ctx.ip !== "unknown" ? pepperedHash("ip", ctx.ip) : null,
      userAgent: ctx?.userAgent ?? null,
    });
  }
}
