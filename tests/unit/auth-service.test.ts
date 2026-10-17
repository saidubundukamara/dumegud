import { beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimitedError, ValidationError } from "@/server/lib/errors";
import { AuthService, lockoutUntil } from "@/server/services/AuthService";
import { createAuthFakes } from "../fixtures/auth-fakes";

// Fast, deterministic stand-in for Argon2; the real hasher has its own test.
vi.mock("@/server/lib/password", () => ({
  hashPassword: vi.fn(async (p: string) => `hashed:${p}`),
  verifyPassword: vi.fn(async (hash: string, p: string) => hash === `hashed:${p}`),
  verifyAgainstDummy: vi.fn(async () => false),
}));

const password = await import("@/server/lib/password");
const ctx = { ip: "203.0.113.7", userAgent: "vitest" };
const PASSWORD = "correct horse battery";

let fakes: ReturnType<typeof createAuthFakes>;
let service: AuthService;

beforeEach(() => {
  vi.clearAllMocks();
  fakes = createAuthFakes();
  service = new AuthService(fakes.deps);
});

describe("lockoutUntil", () => {
  const now = new Date("2026-10-17T00:00:00Z");
  it("doesn't lock below the threshold", () => {
    expect(lockoutUntil(9, now)).toBeNull();
  });
  it("locks for 15 minutes at 10 failures, doubling after, capped at 24h", () => {
    expect(lockoutUntil(10, now)!.getTime() - now.getTime()).toBe(15 * 60_000);
    expect(lockoutUntil(11, now)!.getTime() - now.getTime()).toBe(30 * 60_000);
    expect(lockoutUntil(40, now)!.getTime() - now.getTime()).toBe(24 * 60 * 60_000);
  });
});

describe("register", () => {
  it("creates a user with a hashed password", async () => {
    const outcome = await service.register({ name: "Aminata", email: "aminata@example.com", password: PASSWORD });
    expect(outcome.created).toBe(true);
    const user = [...fakes.users.values()][0];
    expect(user.passwordHash).toBe(`hashed:${PASSWORD}`);
    expect(user.role).toBe("creator");
  });

  it("reports an existing email without failing, and still spends the hash", async () => {
    fakes.addUser({ email: "aminata@example.com" });
    const outcome = await service.register({ name: "X", email: "aminata@example.com", password: PASSWORD });
    expect(outcome).toEqual({ created: false, email: "aminata@example.com" });
    expect(password.hashPassword).toHaveBeenCalledTimes(1);
  });

  it("onUserCreated sends a verification link that verifies the email once", async () => {
    const outcome = await service.register({ name: "Aminata", email: "aminata@example.com", password: PASSWORD });
    if (!outcome.created) throw new Error("expected created");
    await service.onUserCreated(outcome.userId);
    expect(fakes.sent.at(-1)?.tag).toBe("verify-email");
    expect(fakes.sent.at(-1)?.text).toContain("https://dumegud.test/verify-email?token=");

    const token = fakes.lastLinkToken()!;
    await service.verifyEmail(token, ctx);
    expect(fakes.users.get(outcome.userId)?.emailVerified).not.toBeNull();
    expect(fakes.eventTypes()).toContain("email_verified");
    await expect(service.verifyEmail(token, ctx)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an expired verification link", async () => {
    const user = fakes.addUser({});
    await service.onUserCreated(user.id);
    fakes.advance(24 * 60 * 60 * 1000 + 1);
    await expect(service.verifyEmail(fakes.lastLinkToken()!, ctx)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("verifyCredentials", () => {
  it("returns the session user and logs success for a correct password", async () => {
    const user = fakes.addUser({ passwordHash: `hashed:${PASSWORD}`, failedLoginCount: 3 });
    const result = await service.verifyCredentials({ email: "AMINATA@example.com ", password: PASSWORD }, ctx);
    expect(result).toMatchObject({ id: user.id, role: "creator", sessionVersion: 1 });
    expect(fakes.users.get(user.id)?.failedLoginCount).toBe(0);
    expect(fakes.events.at(-1)).toMatchObject({ type: "login_success", userId: user.id });
    expect(fakes.events.at(-1)?.ipHash).not.toContain("203.0.113.7");
  });

  it("treats unknown email and wrong password the same way (null + one Argon2 check each)", async () => {
    fakes.addUser({ passwordHash: `hashed:${PASSWORD}` });
    expect(await service.verifyCredentials({ email: "nobody@example.com", password: PASSWORD }, ctx)).toBeNull();
    expect(password.verifyAgainstDummy).toHaveBeenCalledTimes(1);
    expect(await service.verifyCredentials({ email: "aminata@example.com", password: "wrong password!" }, ctx)).toBeNull();
    expect(password.verifyPassword).toHaveBeenCalledTimes(1);
  });

  it("locks the account after repeated failures, even for the right password", async () => {
    const user = fakes.addUser({ passwordHash: `hashed:${PASSWORD}` });
    for (let i = 0; i < 10; i++) {
      await service.verifyCredentials({ email: user.email, password: "wrong password!" }, ctx);
    }
    expect(fakes.users.get(user.id)?.lockedUntil).not.toBeNull();
    expect(await service.verifyCredentials({ email: user.email, password: PASSWORD }, ctx)).toBeNull();
    fakes.advance(15 * 60_000 + 1);
    expect(await service.verifyCredentials({ email: user.email, password: PASSWORD }, ctx)).not.toBeNull();
  });

  it.each(["suspended", "closed"] as const)("refuses %s users", async (status) => {
    const user = fakes.addUser({ passwordHash: `hashed:${PASSWORD}`, status });
    expect(await service.verifyCredentials({ email: user.email, password: PASSWORD }, ctx)).toBeNull();
    expect(password.verifyAgainstDummy).toHaveBeenCalled();
  });

  it("refuses Google-only accounts (no password hash)", async () => {
    const user = fakes.addUser({ passwordHash: null });
    expect(await service.verifyCredentials({ email: user.email, password: PASSWORD }, ctx)).toBeNull();
  });

  it("throws RateLimitedError when the per-email limit is hit", async () => {
    fakes.rateLimited.add("login:email:aminata@example.com");
    await expect(
      service.verifyCredentials({ email: "aminata@example.com", password: PASSWORD }, ctx),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("returns null for malformed input without touching the database", async () => {
    expect(await service.verifyCredentials({ email: ["x"], password: 1 }, ctx)).toBeNull();
    expect(fakes.events).toHaveLength(0);
  });
});

describe("password reset", () => {
  it("does nothing for unknown or Google-only emails", async () => {
    fakes.addUser({ email: "google@example.com", passwordHash: null });
    await service.requestPasswordReset("nobody@example.com", ctx);
    await service.requestPasswordReset("google@example.com", ctx);
    expect(fakes.sent).toHaveLength(0);
  });

  it("resets with a single-use link, revokes sessions and verifies the email", async () => {
    const user = fakes.addUser({ passwordHash: "hashed:old password!" });
    await service.requestPasswordReset(user.email, ctx);
    expect(fakes.sent.at(-1)?.tag).toBe("reset-password");
    const token = fakes.lastLinkToken()!;

    await service.resetPassword({ token, password: "brand new password" }, ctx);
    const after = fakes.users.get(user.id)!;
    expect(after.passwordHash).toBe("hashed:brand new password");
    expect(after.sessionVersion).toBe(2);
    expect(after.emailVerified).not.toBeNull();
    expect(fakes.sent.at(-1)?.tag).toBe("password-changed");

    await expect(service.resetPassword({ token, password: "another password" }, ctx)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("only the newest reset link works, and links expire after 30 minutes", async () => {
    const user = fakes.addUser({ passwordHash: "hashed:old password!" });
    await service.requestPasswordReset(user.email, ctx);
    const first = fakes.lastLinkToken()!;
    await service.requestPasswordReset(user.email, ctx);
    const second = fakes.lastLinkToken()!;

    await expect(service.resetPassword({ token: first, password: "brand new password" }, ctx)).rejects.toThrow();
    fakes.advance(30 * 60_000 + 1);
    await expect(service.resetPassword({ token: second, password: "brand new password" }, ctx)).rejects.toThrow();
  });
});

describe("changePassword / signOutEverywhere", () => {
  const actorFor = (userId: string) => ({ userId, role: "creator" as const, status: "active" as const, emailVerified: true });

  it("requires the current password", async () => {
    const user = fakes.addUser({ passwordHash: `hashed:${PASSWORD}` });
    await expect(
      service.changePassword(actorFor(user.id), { currentPassword: "nope", password: "brand new password", confirmPassword: "brand new password" }, ctx),
    ).rejects.toMatchObject({ fieldErrors: { currentPassword: expect.any(Array) } });
  });

  it("changes the password and bumps the session version", async () => {
    const user = fakes.addUser({ passwordHash: `hashed:${PASSWORD}` });
    await service.changePassword(
      actorFor(user.id),
      { currentPassword: PASSWORD, password: "brand new password", confirmPassword: "brand new password" },
      ctx,
    );
    expect(fakes.users.get(user.id)).toMatchObject({ passwordHash: "hashed:brand new password", sessionVersion: 2 });
  });

  it("signOutEverywhere bumps the session version", async () => {
    const user = fakes.addUser({});
    await service.signOutEverywhere(actorFor(user.id), ctx);
    expect(fakes.users.get(user.id)?.sessionVersion).toBe(2);
    expect(fakes.eventTypes()).toEqual(["logout_everywhere"]);
  });
});

describe("Google sign-in", () => {
  it("blocks suspended accounts and allows new ones", async () => {
    fakes.addUser({ email: "blocked@example.com", status: "suspended" });
    expect(await service.canUseGoogleSignIn("Blocked@example.com")).toBe(false);
    expect(await service.canUseGoogleSignIn("new@example.com")).toBe(true);
  });

  it("marks the email verified when Google is linked", async () => {
    const user = fakes.addUser({});
    await service.onGoogleLinked(user.id);
    expect(fakes.users.get(user.id)?.emailVerified).not.toBeNull();
    expect(fakes.eventTypes()).toEqual(["google_linked"]);
  });
});

it("email failures never fail the auth operation", async () => {
  fakes.deps.email.send = async () => {
    throw new Error("provider down");
  };
  const user = fakes.addUser({ passwordHash: "hashed:old password!" });
  await expect(service.requestPasswordReset(user.email, ctx)).resolves.toBeUndefined();
});
