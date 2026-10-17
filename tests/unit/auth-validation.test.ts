import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema, resetPasswordSchema } from "@/server/validation/auth";

describe("registerSchema", () => {
  const valid = { name: "Aminata", email: "  Aminata@Example.COM ", password: "a long passphrase" };

  it("normalises the email", () => {
    expect(registerSchema.parse(valid).email).toBe("aminata@example.com");
  });

  it("strips fields outside the allow-list (no mass assignment)", () => {
    const parsed = registerSchema.parse({ ...valid, role: "super_admin", status: "active", sessionVersion: 99 });
    expect(Object.keys(parsed).sort()).toEqual(["email", "name", "password"]);
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
