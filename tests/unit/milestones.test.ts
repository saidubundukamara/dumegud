import { describe, expect, it } from "vitest";
import { isMilestoneKey, isMoneyMilestone, MILESTONES, nextMilestone, reachedMilestones } from "@/lib/milestones";
import { parseMajorToMinor } from "@/lib/money";

const totals = (o = {}) => ({ supporters: 0, receivedNetMinor: 0, productsSold: 0, daysOnDuMeGud: 0, ...o });

describe("milestones", () => {
  it("Le 100 is counted in minor units", () => {
    expect(MILESTONES.received_100.threshold).toBe(parseMajorToMinor("100"));
    expect(reachedMilestones(totals({ receivedNetMinor: 9_999 }))).toEqual([]);
    expect(reachedMilestones(totals({ receivedNetMinor: 10_000 }))).toEqual(["received_100"]);
  });

  it("lists everything reached, in order", () => {
    expect(reachedMilestones(totals({ supporters: 10, productsSold: 1, daysOnDuMeGud: 365 }))).toEqual(["first_supporter", "supporters_10", "first_sale", "one_year"]);
  });

  it("the next one is the closest, with what's left in words", () => {
    const next = nextMilestone(totals({ supporters: 4, productsSold: 0 }), new Set(["first_supporter"]));
    expect(next).toMatchObject({ key: "supporters_10", remaining: "6 more supporters" });
    expect(nextMilestone(totals({ receivedNetMinor: 9_000 }), new Set())?.remaining).toBe("Le 10 to go");
  });

  it("knows its keys and which ones talk about money", () => {
    expect(isMilestoneKey("first_sale")).toBe(true);
    expect(isMilestoneKey("toString")).toBe(false);
    expect(isMoneyMilestone("received_1000")).toBe(true);
    expect(isMoneyMilestone("supporters_10")).toBe(false);
  });
});
