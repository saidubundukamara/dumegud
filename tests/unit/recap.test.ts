import { describe, expect, it } from "vitest";
import { formatMonth, isMonthKey, monthKey, monthRange, previousMonth, recapCaption, recapLines, type RecapStats } from "@/lib/recap";

const stats = (o: Partial<RecapStats> = {}): RecapStats => ({
  month: "2026-09",
  supporters: 34,
  newSupporters: 15,
  gifts: 40,
  productsSold: 12,
  receivedNetMinor: 125_000,
  giftsNetMinor: 100_000,
  salesNetMinor: 25_000,
  topSource: "tiktok",
  bestMonth: true,
  ...o,
});

describe("recap months", () => {
  it("are calendar months in Freetown time (UTC), across the year boundary", () => {
    expect(monthKey(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
    expect(monthRange("2026-12")).toEqual({ from: new Date("2026-12-01T00:00:00Z"), to: new Date("2027-01-01T00:00:00Z") });
    expect(previousMonth("2027-01")).toBe("2026-12");
    expect(formatMonth("2026-09")).toBe("September");
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-09")).toBe(true);
  });
});

describe("recap lines", () => {
  it("leave out amounts unless asked, and skip zeros", () => {
    expect(recapLines(stats(), { showAmounts: false }).map((l) => l.key)).toEqual(["supporters", "sold", "new", "source"]);
    expect(recapLines(stats(), { showAmounts: true }).map((l) => l.key)).toEqual(["supporters", "received", "sold", "new", "source"]);
    expect(recapLines(stats({ productsSold: 0, topSource: "direct", newSupporters: 34 }), { showAmounts: false }).map((l) => l.key)).toEqual(["supporters"]);
    expect(recapLines(stats({ supporters: 1 }), { showAmounts: false })[0].label).toBe("person supported me");
  });

  it("caption only names money when amounts are on", () => {
    expect(recapCaption(stats(), { showAmounts: false, pageUrl: "dumegud.com/aminata" })).not.toMatch(/Le /);
    expect(recapCaption(stats(), { showAmounts: true, pageUrl: "dumegud.com/aminata" })).toMatch(/Le 1,250/);
  });
});
