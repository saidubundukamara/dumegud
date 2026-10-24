import type { AuthEventType, User } from "@/server/db/schema";
import type { EmailMessage, EmailService } from "@/server/integrations/email";
import type { NewAuthEvent } from "@/server/repositories/AuthEventRepository";
import type { AuthServiceDeps } from "@/server/services/AuthService";

// In-memory stand-ins for the auth repositories, so AuthService rules can be tested without a
// database. They mirror the SQL semantics that matter (unique email, single-use tokens).

export function makeUser(overrides: Partial<User> = {}): User {
  const now = new Date("2026-10-01T00:00:00Z");
  return {
    id: crypto.randomUUID(),
    name: "Aminata",
    email: "aminata@example.com",
    emailVerified: null,
    image: null,
    passwordHash: null,
    role: "creator",
    status: "active",
    sessionVersion: 1,
    failedLoginCount: 0,
    lockedUntil: null,
    dateOfBirthEnc: null,
    dateOfBirthRequired: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function createAuthFakes(opts: { now?: Date } = {}) {
  let now = opts.now ?? new Date("2026-10-17T12:00:00Z");
  const users = new Map<string, User>();
  const verification = new Map<string, { identifier: string; expires: Date }>();
  const resets = new Map<string, { userId: string; expiresAt: Date; usedAt: Date | null }>();
  const events: NewAuthEvent[] = [];
  const sent: EmailMessage[] = [];
  const rateLimited = new Set<string>();

  const byEmail = (email: string) => [...users.values()].find((u) => u.email === email) ?? null;
  const update = (id: string, patch: Partial<User>) => {
    const u = users.get(id);
    if (u) users.set(id, { ...u, ...patch });
  };

  const userRepo = {
    findById: async (id: string) => users.get(id) ?? null,
    findByEmail: async (email: string) => byEmail(email),
    findAuthState: async (id: string) => {
      const u = users.get(id);
      return u ? { ...u, needsDateOfBirth: u.dateOfBirthRequired && u.dateOfBirthEnc === null } : null;
    },
    insertIfEmailFree: async (
      data: Pick<User, "email" | "name" | "passwordHash"> & Partial<Pick<User, "dateOfBirthEnc" | "dateOfBirthRequired">>,
    ) => {
      if (byEmail(data.email)) return null;
      const user = makeUser({ ...data });
      users.set(user.id, user);
      return user;
    },
    setDateOfBirth: async (id: string, dateOfBirthEnc: string) => {
      const u = users.get(id);
      if (!u || u.dateOfBirthEnc !== null) return false;
      update(id, { dateOfBirthEnc, dateOfBirthRequired: false });
      return true;
    },
    deletePendingDateOfBirth: async (id: string) => {
      const u = users.get(id);
      if (!u || !u.dateOfBirthRequired || u.dateOfBirthEnc !== null || u.role !== "creator") return false;
      return users.delete(id);
    },
    recordLoginSuccess: async (id: string) => update(id, { failedLoginCount: 0, lockedUntil: null }),
    incrementFailedLogins: async (id: string) => {
      const count = (users.get(id)?.failedLoginCount ?? 0) + 1;
      update(id, { failedLoginCount: count });
      return count;
    },
    setLockedUntil: async (id: string, lockedUntil: Date) => update(id, { lockedUntil }),
    setPasswordHash: async (id: string, passwordHash: string, _tx?: unknown, opts: { expectedHash?: string } = {}) => {
      const u = users.get(id)!;
      if (opts.expectedHash !== undefined && u.passwordHash !== opts.expectedHash) return false;
      update(id, { passwordHash, failedLoginCount: 0, lockedUntil: null, sessionVersion: u.sessionVersion + 1 });
      return true;
    },
    bumpSessionVersion: async (id: string) => update(id, { sessionVersion: users.get(id)!.sessionVersion + 1 }),
    markEmailVerified: async (id: string, at: Date) => {
      if (users.get(id)?.emailVerified) return false;
      update(id, { emailVerified: at });
      return true;
    },
  };

  const tokenRepo = {
    replaceVerificationToken: async (userId: string, tokenHash: string, expires: Date) => {
      for (const [k, v] of verification) if (v.identifier === userId) verification.delete(k);
      verification.set(tokenHash, { identifier: userId, expires });
    },
    consumeVerificationToken: async (tokenHash: string, at: Date) => {
      const row = verification.get(tokenHash);
      verification.delete(tokenHash);
      return row && row.expires > at ? row.identifier : null;
    },
    replacePasswordResetToken: async (userId: string, tokenHash: string, expiresAt: Date) => {
      for (const [k, v] of resets) if (v.userId === userId && !v.usedAt) resets.delete(k);
      resets.set(tokenHash, { userId, expiresAt, usedAt: null });
    },
    invalidateUnusedResetTokens: async (userId: string) => {
      for (const [k, v] of resets) if (v.userId === userId && !v.usedAt) resets.delete(k);
    },
    consumePasswordResetToken: async (tokenHash: string, at: Date) => {
      const row = resets.get(tokenHash);
      if (!row || row.usedAt || row.expiresAt <= at) return null;
      row.usedAt = at;
      return row.userId;
    },
  };

  const email: EmailService = {
    send: async (m) => {
      sent.push(m);
    },
  };

  const deps: AuthServiceDeps = {
    repos: {
      users: userRepo as unknown as AuthServiceDeps["repos"]["users"],
      authTokens: tokenRepo as unknown as AuthServiceDeps["repos"]["authTokens"],
      authEvents: {
        append: async (e: NewAuthEvent) => {
          events.push(e);
        },
      } as unknown as AuthServiceDeps["repos"]["authEvents"],
    },
    email,
    appBaseUrl: "https://dumegud.test/",
    now: () => now,
    rateLimit: async (policy, id) => {
      if (rateLimited.has(`${policy}:${id}`)) {
        const { RateLimitedError } = await import("@/server/lib/errors");
        throw new RateLimitedError(60);
      }
    },
    transaction: (fn) => fn(undefined as never),
  };

  return {
    deps,
    users,
    events,
    sent,
    rateLimited,
    eventTypes: () => events.map((e) => e.type as AuthEventType),
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
    addUser: (overrides: Partial<User>) => {
      const user = makeUser(overrides);
      users.set(user.id, user);
      return user;
    },
    /** Pull the raw token out of the last emailed link. */
    lastLinkToken: () => /token=([A-Za-z0-9_-]+)/.exec(sent.at(-1)?.text ?? "")?.[1] ?? null,
  };
}
