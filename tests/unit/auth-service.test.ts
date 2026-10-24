import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptField } from "@/server/lib/crypto";
import { RateLimitedError, ValidationError } from "@/server/lib/errors";
import { AuthService, lockoutUntil } from "@/server/services/AuthService";
import { INVALID_DOB_MESSAGE } from "@/server/validation/auth";
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
const DOB = "1998-04-27";

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
    const outcome = await service.register({ name: "Aminata", email: "aminata@example.com", dateOfBirth: DOB, password: PASSWORD });
    expect(outcome.created).toBe(true);
    const user = [...fakes.users.values()][0];
    expect(user.passwordHash).toBe(`hashed:${PASSWORD}`);
    expect(user.role).toBe("creator");
    expect(user.dateOfBirthRequired).toBe(false);
    expect(decryptField(user.dateOfBirthEnc!)).toBe(DOB);
  });

  it("reports an existing email without failing, and still spends the hash", async () => {
    fakes.addUser({ email: "aminata@example.com" });
    const outcome = await service.register({ name: "X", email: "aminata@example.com", dateOfBirth: DOB, password: PASSWORD });
    expect(outcome).toEqual({ created: false, email: "aminata@example.com" });
    expect(password.hashPassword).toHaveBeenCalledTimes(1);
  });

  it("onUserCreated sends a verification link that verifies the email once", async () => {
    const outcome = await service.register({ name: "Aminata", email: "aminata@example.com", dateOfBirth: DOB, password: PASSWORD });
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

  it("doesn't overwrite a password reset that landed while the new password was hashing", async () => {
    const user = fakes.addUser({ passwordHash: `hashed:${PASSWORD}` });
    const stale = { ...fakes.users.get(user.id)! };
    fakes.users.set(user.id, { ...stale, passwordHash: "hashed:reset by the owner" }); // the reset commits
    const repo = fakes.deps.repos.users as unknown as { findById: (id: string) => Promise<unknown> };
    repo.findById = async () => stale; // what changePassword read before it
    await expect(
      service.changePassword(actorFor(user.id), { currentPassword: PASSWORD, password: "brand new password", confirmPassword: "brand new password" }, ctx),
    ).rejects.toThrow(/just changed/);
    expect(fakes.users.get(user.id)?.passwordHash).toBe("hashed:reset by the owner");
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

  it("refuses a different Google account while another user is signed in", async () => {
    const signedIn = fakes.addUser({ email: "creator@example.com" });
    expect(await service.canUseGoogleSignIn("someone.else@example.com", signedIn.id)).toBe(false);
    expect(await service.canUseGoogleSignIn("Creator@example.com", signedIn.id)).toBe(true);
    expect(await service.canUseGoogleSignIn("creator@example.com", "missing-user")).toBe(false);
  });

  it("marks the email verified when Google is linked", async () => {
    const user = fakes.addUser({});
    await service.onGoogleLinked(user.id);
    expect(fakes.users.get(user.id)?.emailVerified).not.toBeNull();
    expect(fakes.eventTypes()).toEqual(["google_linked"]);
  });
});

describe("age gate (Google sign-ups)", () => {
  // The fakes' clock is 2026-10-17.
  const actorFor = (userId: string) => ({ userId, role: "creator" as const, status: "active" as const, emailVerified: true });
  let provision: ReturnType<typeof vi.fn<(userId: string) => Promise<unknown>>>;
  beforeEach(() => {
    provision = vi.fn(async () => ({}) as unknown);
    service = new AuthService({ ...fakes.deps, wallets: { provisionForCreator: provision } });
  });

  it("onUserCreated holds the wallet back until the date of birth is given", async () => {
    const user = fakes.addUser({ emailVerified: new Date(), dateOfBirthRequired: true });
    await service.onUserCreated(user.id);
    expect(provision).not.toHaveBeenCalled();
  });

  it("onUserCreated provisions straight away for an email sign-up", async () => {
    const outcome = await service.register({ name: "Aminata", email: "aminata@example.com", dateOfBirth: DOB, password: PASSWORD });
    if (!outcome.created) throw new Error("expected created");
    await service.onUserCreated(outcome.userId);
    expect(provision).toHaveBeenCalledWith(outcome.userId);
  });

  it("an adult's date is stored encrypted, once, and the wallet is created", async () => {
    const user = fakes.addUser({ dateOfBirthRequired: true });
    expect(await service.confirmDateOfBirth(actorFor(user.id), "2008-10-17")).toBe("confirmed");
    const row = fakes.users.get(user.id)!;
    expect(decryptField(row.dateOfBirthEnc!)).toBe("2008-10-17");
    expect(row.dateOfBirthRequired).toBe(false);
    expect(provision).toHaveBeenCalledWith(user.id);

    await service.confirmDateOfBirth(actorFor(user.id), "1990-01-01");
    expect(decryptField(fakes.users.get(user.id)!.dateOfBirthEnc!)).toBe("2008-10-17");
  });

  it("an under-18 date is checked once more, then the sign-up is deleted with nothing kept", async () => {
    const user = fakes.addUser({ dateOfBirthRequired: true });
    expect(await service.confirmDateOfBirth(actorFor(user.id), "2008-10-18")).toBe("confirm_under_age");
    expect(fakes.users.has(user.id)).toBe(true);
    expect(await service.confirmDateOfBirth(actorFor(user.id), "2008-10-18", { underAgeConfirmed: true })).toBe("deleted");
    expect(fakes.users.has(user.id)).toBe(false);
    expect(provision).not.toHaveBeenCalled();
  });

  it("a confirmation flag never deletes an adult", async () => {
    const user = fakes.addUser({ dateOfBirthRequired: true });
    expect(await service.confirmDateOfBirth(actorFor(user.id), "1990-01-01", { underAgeConfirmed: true })).toBe("confirmed");
    expect(fakes.users.has(user.id)).toBe(true);
  });

  it("abandonPendingSignUp removes only an account waiting at the gate", async () => {
    const pending = fakes.addUser({ email: "p@example.com", dateOfBirthRequired: true });
    const normal = fakes.addUser({ email: "n@example.com" });
    await service.abandonPendingSignUp(actorFor(pending.id));
    await service.abandonPendingSignUp(actorFor(normal.id));
    expect(fakes.users.has(pending.id)).toBe(false);
    expect(fakes.users.has(normal.id)).toBe(true);
  });

  it("never deletes an account that already has a date of birth or isn't a creator", async () => {
    const dated = fakes.addUser({ email: "a@example.com", dateOfBirthEnc: "x", dateOfBirthRequired: false });
    const staff = fakes.addUser({ email: "s@example.com", role: "staff", dateOfBirthRequired: true });
    await service.confirmDateOfBirth(actorFor(dated.id), "2015-01-01", { underAgeConfirmed: true });
    await service.confirmDateOfBirth(actorFor(staff.id), "2015-01-01", { underAgeConfirmed: true });
    expect(fakes.users.has(dated.id)).toBe(true);
    expect(fakes.users.has(staff.id)).toBe(true);
  });

  it.each([["", "Enter your date of birth."], ["2000-02-31", INVALID_DOB_MESSAGE], ["2030-01-01", INVALID_DOB_MESSAGE]])(
    "rejects %j as a field error",
    async (dob, message) => {
      const user = fakes.addUser({ dateOfBirthRequired: true });
      const err = await service.confirmDateOfBirth(actorFor(user.id), dob).catch((e) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.fieldErrors).toEqual({ dateOfBirth: [message] });
      expect(fakes.users.has(user.id)).toBe(true);
    },
  );
});

it("email failures never fail the auth operation", async () => {
  fakes.deps.email.send = async () => {
    throw new Error("provider down");
  };
  const user = fakes.addUser({ passwordHash: "hashed:old password!" });
  await expect(service.requestPasswordReset(user.email, ctx)).resolves.toBeUndefined();
});
