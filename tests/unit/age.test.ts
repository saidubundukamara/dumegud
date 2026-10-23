import { describe, expect, it } from "vitest";
import { ageOn, checkDateOfBirth, formatCalendarDate, isoFromParts, parseIsoDate } from "@/lib/age";

const on = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("parseIsoDate", () => {
  it("accepts real calendar dates only", () => {
    expect(parseIsoDate("2000-02-29")).toEqual({ year: 2000, month: 2, day: 29 });
    expect(parseIsoDate("2001-02-29")).toBeNull();
    expect(parseIsoDate("2000-02-31")).toBeNull();
    expect(parseIsoDate("2000-13-01")).toBeNull();
    expect(parseIsoDate("27/04/1998")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
  });
});

describe("ageOn", () => {
  it("counts whole years by the calendar", () => {
    const dob = parseIsoDate("2008-10-23")!;
    expect(ageOn(dob, on("2026-10-22"))).toBe(17);
    expect(ageOn(dob, on("2026-10-23"))).toBe(18);
  });

  it("a 29 February birthday turns a year older on 1 March in common years", () => {
    const dob = parseIsoDate("2008-02-29")!;
    expect(ageOn(dob, on("2026-02-28"))).toBe(17);
    expect(ageOn(dob, on("2026-03-01"))).toBe(18);
  });
});

describe("checkDateOfBirth", () => {
  const today = on("2026-10-23");
  it.each([
    ["2008-10-23", "ok"], // 18 today
    ["2008-10-22", "ok"],
    ["2008-10-24", "under_age"], // 18 tomorrow
    ["2020-01-01", "under_age"],
    ["2026-10-24", "invalid"], // the future
    ["1906-10-23", "invalid"], // 120
    ["1906-10-24", "ok"], // 119
    ["2000-02-31", "invalid"],
  ])("%s → %s", (dob, expected) => {
    expect(checkDateOfBirth(dob, today)).toBe(expected);
  });
});

describe("isoFromParts", () => {
  it("pads the day and month the form sends", () => {
    expect(isoFromParts("4", "3", "1998")).toBe("1998-03-04");
    expect(isoFromParts(" 27 ", "12", "1990")).toBe("1990-12-27");
  });
  it("is empty only when nothing was entered", () => {
    expect(isoFromParts("", "", "")).toBe("");
  });
  it.each([
    ["4", "3", "98"],
    ["", "3", "1998"],
    ["x", "3", "1998"],
    ["4", "", "1998"],
  ])("leaves %j/%j/%j invalid", (d, m, y) => {
    expect(checkDateOfBirth(isoFromParts(d, m, y))).toBe("invalid");
  });
});

it("formatCalendarDate spells the month out", () => {
  expect(formatCalendarDate(parseIsoDate("2010-05-14")!)).toBe("14 May 2010");
});
