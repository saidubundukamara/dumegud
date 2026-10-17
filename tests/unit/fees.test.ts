import { describe, expect, it } from "vitest";
import { computeSplit, quoteSplit } from "@/lib/fees";

describe("computeSplit", () => {
  it("follows the waterfall: gross − monime fee = arrived − platform fee = creator net", () => {
    // Monime's observed production example: 30,000 gross, 300 fee (1%).
    expect(computeSplit(30_000, 300, 500)).toEqual({
      grossMinor: 30_000,
      monimeFeeMinor: 300,
      arrivedMinor: 29_700,
      platformFeeMinor: 1_485,
      creatorNetMinor: 28_215,
    });
  });

  it("floors the platform fee per payment", () => {
    expect(computeSplit(999, 9, 350).platformFeeMinor).toBe(34); // 990 × 3.5% = 34.65
    // Three 100-unit payments at 350 bps take 3 each (9 total), never floor(10.5) = 10.
    const total = [100, 100, 100].reduce((sum, g) => sum + computeSplit(g, 0, 350).platformFeeMinor, 0);
    expect(total).toBe(9);
  });

  it("always balances: net + platform fee + monime fee = gross", () => {
    for (const [gross, fee, bps] of [[1, 0, 500], [12_345, 123, 777], [50_000, 500, 0], [1000, 1000, 500]]) {
      const s = computeSplit(gross, fee, bps);
      expect(s.creatorNetMinor + s.platformFeeMinor + s.monimeFeeMinor).toBe(gross);
      expect(s.creatorNetMinor).toBeGreaterThanOrEqual(0);
    }
  });

  it("rejects fractional amounts and impossible fees", () => {
    expect(() => computeSplit(10.5, 0, 500)).toThrow();
    expect(() => computeSplit(100, 101, 500)).toThrow();
    expect(() => computeSplit(100, -1, 500)).toThrow();
    expect(() => computeSplit(0, 0, 500)).toThrow();
  });
});

describe("quoteSplit", () => {
  it("uses the floored Monime estimate", () => {
    expect(quoteSplit(5_000, 100, 500)).toMatchObject({ monimeFeeMinor: 50, arrivedMinor: 4_950, platformFeeMinor: 247, creatorNetMinor: 4_703 });
  });
});
