import { describe, expect, it } from "vitest";
import { INVALID_DOB_MESSAGE, loginSchema, registerSchema, resetPasswordSchema, UNDER_AGE_MESSAGE } from "@/server/validation/auth";

describe("registerSchema", () => {
  const valid = { name: "Aminata", email: "  Aminata@Example.COM ", dateOfBirth: "1998-04-27", password: "a long passphrase" };

  it("normalises the email", () => {
    expect(registerSchema.parse(valid).email).toBe("aminata@example.com");
  });

  it("strips fields outside the allow-list (no mass assignment)", () => {
    const parsed = registerSchema.parse({ ...valid, role: "super_admin", status: "active", sessionVersion: 99 });
    expect(Object.keys(parsed).sort()).toEqual(["dateOfBirth", "email", "name", "password"]);
  });

  it.each([
    ["too short", "short1234"],
    ["common", "qwertyuiop"],
    ["common, case-insensitive", "Password123"],
    ["too long", "x".repeat(129)],
  ])("rejects a %s password", (_label, password) => {
    expect(registerSchema.safeParse({ ...valid, password }).success).toBe(false);
  });

  it("rejects a password equal to the email", () => {
    const r = registerSchema.safeParse({ ...valid, email: "aminata@example.com", password: "aminata@example.com" });
    expect(r.success).toBe(false);
  });

  it("requires a date of birth and refuses anyone under 18", () => {
    const today = new Date();
    const iso = (yearsAgo: number, dayShift = 0) => {
      const d = new Date(Date.UTC(today.getUTCFullYear() - yearsAgo, today.getUTCMonth(), today.getUTCDate() + dayShift));
      return d.toISOString().slice(0, 10);
    };
    const error = (dateOfBirth: string) => registerSchema.safeParse({ ...valid, dateOfBirth }).error?.issues[0]?.message;
    expect(error("")).toBe("Enter your date of birth.");
    expect(error("27/04/1998")).toBe(INVALID_DOB_MESSAGE);
    expect(error(iso(18, 1))).toBe(UNDER_AGE_MESSAGE);
    expect(registerSchema.safeParse({ ...valid, dateOfBirth: iso(18) }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(registerSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("doesn't apply new-password rules (old passwords keep working)", () => {
    expect(loginSchema.safeParse({ email: "a@example.com", password: "short" }).success).toBe(true);
  });
});

describe("resetPasswordSchema", () => {
  const token = "A".repeat(43);
  it("requires matching passwords", () => {
    const r = resetPasswordSchema.safeParse({ token, password: "a long passphrase", confirmPassword: "different!!" });
    expect(r.success).toBe(false);
  });
  it("rejects malformed tokens", () => {
    const r = resetPasswordSchema.safeParse({ token: "<script>", password: "a long passphrase", confirmPassword: "a long passphrase" });
    expect(r.success).toBe(false);
  });
});
