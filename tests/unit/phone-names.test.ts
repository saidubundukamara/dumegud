import { describe, expect, it } from "vitest";
import { detectOperator, maxWithdrawableMinor, normalizeSlPhone, payoutFee } from "@/lib/phone";
import { matchNames } from "@/server/lib/name-match";

const prefixes = { m17: ["76", "78"], m18: ["77", "30"] };

describe("normalizeSlPhone", () => {
  it.each([
    ["076 123 456", "23276123456"],
    ["+232 76 123456", "23276123456"],
    ["0023276123456", "23276123456"],
    ["23276123456", "23276123456"],
    ["76-123-456", "23276123456"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeSlPhone(input)).toBe(expected);
  });

  it.each(["", "12345", "+44 7700 900123", "2327612345", "076 123 45a", "232761234567"])("rejects %s", (input) => {
    expect(normalizeSlPhone(input)).toBeNull();
  });

  it("detects the operator from the prefix table", () => {
    expect(detectOperator("23276123456", prefixes)).toBe("m17");
    expect(detectOperator("23277123456", prefixes)).toBe("m18");
    expect(detectOperator("23299123456", prefixes)).toBeNull();
  });
});

describe("payout fee maths (fee on top)", () => {
  it("never lets amount + fee exceed the available balance", () => {
    for (const available of [0, 1, 99, 100, 101, 10_100, 28_809, 1_000_000]) {
      const max = maxWithdrawableMinor(available, 100);
      expect(max + payoutFee(max, 100)).toBeLessThanOrEqual(available);
      expect(max + 1 + payoutFee(max + 1, 100)).toBeGreaterThan(available);
    }
    expect(maxWithdrawableMinor(10_100, 100)).toBe(10_000);
  });
});

describe("matchNames", () => {
  it.each([
    ["AMINATA KAMARA", "Aminata Kamara", "match"],
    ["Kamara Aminata", "Aminata Kamara", "match"],
    ["A. KAMARA", "Aminata Kamara", "match"],
    ["Aminata F. Kamara", "Aminata Fatmata Kamara", "match"],
    ["Aminata Kamara", "Aminata Fatmata Kamara", "match"],
    ["Amínata Kàmara", "Aminata Kamara", "match"],
    ["Aminata Sesay", "Aminata Kamara", "partial"],
    ["Mohamed Bangura", "Aminata Kamara", "mismatch"],
    ["A. K.", "Aminata Kamara", "mismatch"],
    ["", "Aminata Kamara", "unavailable"],
  ])("%s vs %s → %s", (holder, legal, expected) => {
    expect(matchNames(holder, legal)).toBe(expected);
  });
});
