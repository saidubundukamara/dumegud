import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateRecoveryCodes, generateTotpSecret, hotp, matchTotp, normaliseRecoveryCode, otpauthUrl, totpCounter } from "@/server/lib/totp";

// RFC 6238 appendix B (SHA-1 secret "12345678901234567890"), truncated to 6 digits.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("totp", () => {
  it("round-trips base32", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(RFC_SECRET).toString()).toBe("12345678901234567890");
    expect(base32Decode("gezd gnbv-gy3t")).toEqual(base32Decode("GEZDGNBVGY3T"));
  });

  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("matches the RFC vector at T=%i", (seconds, code) => {
    expect(hotp(RFC_SECRET, totpCounter(new Date(seconds * 1000)))).toBe(code);
  });

  it("accepts one step of drift either way and returns the matched step", () => {
    const now = new Date(1_800_000_000_000);
    const step = totpCounter(now);
    expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step), now)).toBe(step);
    expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step + 1), now)).toBe(step + 1);
    expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step + 2), now)).toBeNull();
    expect(matchTotp(RFC_SECRET, ` ${hotp(RFC_SECRET, step).slice(0, 3)} ${hotp(RFC_SECRET, step).slice(3)} `, now)).toBe(step);
    expect(matchTotp(RFC_SECRET, "12345", now)).toBeNull();
    expect(matchTotp(RFC_SECRET, "abcdef", now)).toBeNull();
  });

  it("makes 160-bit secrets, an otpauth URL and distinct recovery codes", () => {
    expect(base32Decode(generateTotpSecret())).toHaveLength(20);
    const url = new URL(otpauthUrl("ABC", "a@dumegud.test"));
    expect(url.protocol).toBe("otpauth:");
    expect(url.searchParams.get("secret")).toBe("ABC");
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}-[a-z2-7]{4}$/);
    expect(normaliseRecoveryCode(` ${codes[0]!.toUpperCase()} `)).toBe(codes[0]!.replace(/-/g, ""));
  });
});
