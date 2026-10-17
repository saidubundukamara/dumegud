import "server-only";
import type { AuthEventType, Role, User } from "@/server/db/schema";
import type { EmailMessage, EmailService } from "@/server/integrations/email";
import {
  existingAccountTemplate,
  passwordChangedTemplate,
  resetPasswordTemplate,
  verifyEmailTemplate,
} from "@/server/integrations/email/templates";
import { randomToken, sha256 } from "@/server/lib/crypto";
import { ValidationError } from "@/server/lib/errors";
import { pepperedHash } from "@/server/lib/hash";
import { logger } from "@/server/lib/logger";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/server/lib/password";
import { enforceRateLimit, type RateLimitPolicy } from "@/server/lib/rate-limit";
import type { AuthEventRepository } from "@/server/repositories/AuthEventRepository";
import type { AuthTokenRepository } from "@/server/repositories/AuthTokenRepository";
import type { UserRepository } from "@/server/repositories/UserRepository";
import { loginSchema, type ChangePasswordInput, type RegisterInput } from "@/server/validation/auth";
import type { Actor, RequestContext } from "./actor";
import { runInTransaction, type Tx } from "./transaction";

const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_PASSWORD_TTL_MS = 30 * 60 * 1000;

const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_BASE_MINUTES = 15;
const LOCKOUT_MAX_MINUTES = 24 * 60;

/**
 * Progressive lockout after repeated wrong passwords. It backs up the rate limiter (which fails
 * open if Redis is down) and survives across IPs. 10 failures → 15 min, then doubling to 24 h.
 */
export function lockoutUntil(failedCount: number, now: Date): Date | null {
  if (failedCount < LOCKOUT_THRESHOLD) return null;
  const minutes = Math.min(LOCKOUT_BASE_MINUTES * 2 ** (failedCount - LOCKOUT_THRESHOLD), LOCKOUT_MAX_MINUTES);
  return new Date(now.getTime() + minutes * 60_000);
}

/** What the Credentials provider hands to Auth.js; becomes the JWT claims. */
export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: Role;
  sessionVersion: number;
};

export type AccountDTO = {
  name: string | null;
  email: string;
  emailVerified: boolean;
  hasPassword: boolean;
  role: Role;
};

export type RegisterOutcome = { created: true; userId: string } | { created: false; email: string };

type AuthRepos = {
  users: UserRepository;
  authTokens: AuthTokenRepository;
  authEvents: AuthEventRepository;
};

export type AuthServiceDeps = {
  repos: AuthRepos;
  email: EmailService;
  /** Wallet provisioning for new users (WalletService in production). */
  wallets?: { provisionForCreator(userId: string): Promise<unknown> };
  appBaseUrl: string;
  now?: () => Date;
  rateLimit?: (policy: RateLimitPolicy, identifier: string) => Promise<void>;
  transaction?: typeof runInTransaction;
};

export class AuthService {
  private readonly repos: AuthRepos;
  private readonly email: EmailService;
  private readonly appBaseUrl: string;
  private readonly now: () => Date;
  private readonly rateLimit: (policy: RateLimitPolicy, identifier: string) => Promise<void>;
  private readonly transaction: typeof runInTransaction;
  private readonly wallets: AuthServiceDeps["wallets"];

  constructor(deps: AuthServiceDeps) {
    this.repos = deps.repos;
    this.email = deps.email;
    this.wallets = deps.wallets;
    this.appBaseUrl = deps.appBaseUrl.replace(/\/$/, "");
    this.now = deps.now ?? (() => new Date());
    this.rateLimit = deps.rateLimit ?? enforceRateLimit;
    this.transaction = deps.transaction ?? runInTransaction;
  }

  // ── Registration & email verification ─────────────────────────────────────────

  /**
   * Create a credentials account. The password is hashed before the email is checked so both
   * outcomes cost the same; the caller shows one "check your email" response either way.
   */
  async register(input: RegisterInput): Promise<RegisterOutcome> {
    const passwordHash = await hashPassword(input.password);
    const user = await this.repos.users.insertIfEmailFree({
      email: input.email,
      name: input.name,
      passwordHash,
    });
    return user ? { created: true, userId: user.id } : { created: false, email: input.email };
  }

  /**
   * Post-response work for a new user (credentials or Google): create their Monime wallet and
   * send the verification email. Each step is independent; a failure in one doesn't skip the other.
   */
  async onUserCreated(userId: string): Promise<void> {
    if (this.wallets) {
      await this.wallets.provisionForCreator(userId).catch((err) => {
        logger.error("wallet provisioning threw for new user", { userId, err });
      });
    }
    const user = await this.repos.users.findById(userId);
    if (user && !user.emailVerified) await this.sendVerificationEmail(user);
  }

  /** Tell the owner of an existing email that someone tried to register with it. */
  async sendExistingAccountEmail(email: string): Promise<void> {
    await this.trySend(email, existingAccountTemplate({ loginUrl: this.url("/login"), resetUrl: this.url("/forgot-password") }));
  }

  async resendVerificationEmail(actor: Actor): Promise<void> {
    await this.rateLimit("verify-email:user", actor.userId);
    const user = await this.repos.users.findById(actor.userId);
    if (!user || user.emailVerified) return;
    await this.sendVerificationEmail(user);
  }

  async verifyEmail(token: string, ctx: RequestContext): Promise<void> {
    const now = this.now();
    const userId = await this.repos.authTokens.consumeVerificationToken(sha256(token), now);
    if (!userId) throw new ValidationError("This link is invalid or has expired. Sign in to get a new one.");
    if (await this.repos.users.markEmailVerified(userId, now)) {
      await this.logEvent(userId, "email_verified", ctx);
    }
  }

  // ── Sign-in ───────────────────────────────────────────────────────────────────

  /**
   * Credentials check for Auth.js `authorize`. Returns null for every failure so callers can't
   * tell unknown emails, wrong passwords, locked and suspended accounts apart, and spends one
   * Argon2 verification on every path. Throws RateLimitedError when a limit is hit.
   *
   * Rate limits live here, not in the login action: Auth.js also exposes the credentials
   * callback as a route, so this is the only choke point.
   */
  async verifyCredentials(raw: unknown, ctx: RequestContext): Promise<SessionUser | null> {
    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) return null;
    const { email, password } = parsed.data;

    await this.rateLimit("login:ip", ctx.ip);
    await this.rateLimit("login:email", email);

    const now = this.now();
    const user = await this.repos.users.findByEmail(email);
    const blocked =
      !user ||
      !user.passwordHash ||
      user.status === "suspended" ||
      user.status === "closed" ||
      (user.lockedUntil !== null && user.lockedUntil > now);

    if (blocked) {
      await verifyAgainstDummy(password);
      await this.logEvent(user?.id ?? null, "login_failed", ctx);
      return null;
    }

    if (!(await verifyPassword(user.passwordHash!, password))) {
      const count = await this.repos.users.incrementFailedLogins(user.id);
      const until = lockoutUntil(count, now);
      if (until) await this.repos.users.setLockedUntil(user.id, until);
      await this.logEvent(user.id, "login_failed", ctx);
      return null;
    }

    if (user.failedLoginCount > 0 || user.lockedUntil) await this.repos.users.recordLoginSuccess(user.id);
    await this.logEvent(user.id, "login_success", ctx);
    return toSessionUser(user);
  }

  /** Google sign-in gate: existing suspended/closed users are refused. */
  async canUseGoogleSignIn(email: string): Promise<boolean> {
    const user = await this.repos.users.findByEmail(email.trim().toLowerCase());
    return !user || (user.status !== "suspended" && user.status !== "closed");
  }

  /** Google only links accounts whose email Google has verified, so the email counts as verified. */
  async onGoogleLinked(userId: string): Promise<void> {
    await this.repos.users.markEmailVerified(userId, this.now());
    await this.logEvent(userId, "google_linked", null);
  }

  async recordLogin(userId: string): Promise<void> {
    await this.logEvent(userId, "login_success", null);
  }

  async recordLogout(userId: string, ctx: RequestContext): Promise<void> {
    await this.logEvent(userId, "logout", ctx);
  }

  // ── Passwords ─────────────────────────────────────────────────────────────────

  /** Always resolves without revealing whether the account exists. Run it after the response. */
  async requestPasswordReset(email: string, ctx: RequestContext): Promise<void> {
    const user = await this.repos.users.findByEmail(email);
    if (!user || !user.passwordHash || user.status === "suspended" || user.status === "closed") return;

    const token = randomToken();
    const expiresAt = new Date(this.now().getTime() + RESET_PASSWORD_TTL_MS);
    await this.repos.authTokens.replacePasswordResetToken(user.id, sha256(token), expiresAt);
    await this.logEvent(user.id, "password_reset_requested", ctx);
    await this.trySend(user.email, resetPasswordTemplate({ url: this.url(`/reset-password?token=${token}`) }));
  }

  /**
   * Single-use token → new password. Bumps sessionVersion (every device is signed out). The link
   * proves control of the inbox, so an unverified email becomes verified too.
   */
  async resetPassword(input: { token: string; password: string }, ctx: RequestContext): Promise<void> {
    const passwordHash = await hashPassword(input.password); // outside the transaction: it's slow
    const now = this.now();
    const userId = await this.transaction(async (tx) => {
      const id = await this.repos.authTokens.consumePasswordResetToken(sha256(input.token), now, tx);
      if (!id) return null;
      await this.repos.users.setPasswordHash(id, passwordHash, tx);
      await this.repos.users.markEmailVerified(id, now, tx);
      await this.logEvent(id, "password_changed", ctx, tx);
      return id;
    });
    if (!userId) throw new ValidationError("This link is invalid or has expired. Request a new one.");
    await this.sendPasswordChangedEmail(userId);
  }

  /** Signs out every session, including the current one; the caller sends the user to /login. */
  async changePassword(actor: Actor, input: ChangePasswordInput, ctx: RequestContext): Promise<void> {
    const user = await this.repos.users.findById(actor.userId);
    if (!user?.passwordHash) {
      throw new ValidationError("Your account signs in with Google, so it has no password to change.");
    }
    await this.rateLimit("login:email", user.email);
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new ValidationError(undefined, { currentPassword: ["That password is incorrect."] });
    }
    const passwordHash = await hashPassword(input.password);
    await this.transaction(async (tx) => {
      await this.repos.users.setPasswordHash(user.id, passwordHash, tx);
      await this.logEvent(user.id, "password_changed", ctx, tx);
    });
    await this.sendPasswordChangedEmail(user.id);
  }

  /** Step-up: re-check the signed-in staff member's password. Rate-limited like login. */
  async confirmPassword(actor: Actor, password: string): Promise<boolean> {
    const user = await this.repos.users.findById(actor.userId);
    if (!user) return false;
    await this.rateLimit("login:email", user.email);
    if (!user.passwordHash) {
      await verifyAgainstDummy(password);
      return false;
    }
    return verifyPassword(user.passwordHash, password);
  }

  async signOutEverywhere(actor: Actor, ctx: RequestContext): Promise<void> {
    await this.repos.users.bumpSessionVersion(actor.userId);
    await this.logEvent(actor.userId, "logout_everywhere", ctx);
  }

  async getAccount(actor: Actor): Promise<AccountDTO | null> {
    const user = await this.repos.users.findById(actor.userId);
    if (!user) return null;
    return {
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified !== null,
      hasPassword: user.passwordHash !== null,
      role: user.role,
    };
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  private async sendVerificationEmail(user: Pick<User, "id" | "email" | "name">): Promise<void> {
    const token = randomToken();
    const expires = new Date(this.now().getTime() + VERIFY_EMAIL_TTL_MS);
    await this.repos.authTokens.replaceVerificationToken(user.id, sha256(token), expires);
    await this.trySend(user.email, verifyEmailTemplate({ name: user.name, url: this.url(`/verify-email?token=${token}`) }));
  }

  private async sendPasswordChangedEmail(userId: string): Promise<void> {
    const user = await this.repos.users.findById(userId);
    if (user) await this.trySend(user.email, passwordChangedTemplate({ resetUrl: this.url("/forgot-password") }));
  }

  /** Email is best-effort: a provider outage must not fail (or roll back) the auth operation. */
  private async trySend(to: string, message: Omit<EmailMessage, "to">): Promise<void> {
    try {
      await this.email.send({ to, ...message });
    } catch (err) {
      logger.error("failed to send auth email", { tag: message.tag, err });
    }
  }

  private async logEvent(
    userId: string | null,
    type: AuthEventType,
    ctx: RequestContext | null,
    tx?: Tx,
  ): Promise<void> {
    await this.repos.authEvents.append(
      {
        userId,
        type,
        ipHash: ctx && ctx.ip !== "unknown" ? pepperedHash("ip", ctx.ip) : null,
        userAgent: ctx?.userAgent ?? null,
      },
      tx,
    );
  }

  private url(path: string): string {
    return `${this.appBaseUrl}${path}`;
  }
}

function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role: user.role,
    sessionVersion: user.sessionVersion,
  };
}
