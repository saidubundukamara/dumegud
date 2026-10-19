import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatRelative, isWithin } from "@/lib/dates";

const at = new Date("2026-10-18T14:05:00Z");

describe("dates", () => {
  it("formats in Sierra Leone time without UTC", () => {
    expect(formatDate(at)).toBe("18 Oct 2026");
    expect(formatDateTime(at)).toBe("18 Oct 2026 at 14:05");
  });

  it("describes recent moments relatively, then falls back to the date", () => {
    const later = (ms: number) => new Date(at.getTime() + ms);
    expect(formatRelative(at, later(20_000))).toBe("Just now");
    expect(formatRelative(at, later(5 * 60_000))).toBe("5 min ago");
    expect(formatRelative(at, later(60 * 60_000))).toBe("1 hour ago");
    expect(formatRelative(at, later(3 * 60 * 60_000))).toBe("3 hours ago");
    expect(formatRelative(at, later(30 * 60 * 60_000))).toBe("Yesterday");
    expect(formatRelative(at, later(72 * 60 * 60_000))).toBe("18 Oct 2026");
  });

  it("checks whether something is recent", () => {
    expect(isWithin(at, 60_000, new Date(at.getTime() + 59_999))).toBe(true);
    expect(isWithin(at, 60_000, new Date(at.getTime() + 60_000))).toBe(false);
  });
});
