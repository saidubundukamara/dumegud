import { describe, expect, it } from "vitest";
import { assertMinor, bpsOf, formatMajorInput, formatSLE, parseMajorToMinor } from "@/lib/money";

describe("parseMajorToMinor", () => {
  it.each([
    ["50", 5000],
    ["50.5", 5050],
    ["50.05", 5005],
    ["1,250.75", 125075],
    [" 0.01 ", 1],
    ["0", 0],
  ])("parses %j → %i", (input, expected) => {
    expect(parseMajorToMinor(input)).toBe(expected);
  });

  it.each(["", "abc", "-5", "1.234", "1e3", "12.", ".5", "NaN"])("rejects %j", (input) => {
    expect(parseMajorToMinor(input)).toBeNull();
  });

  it("avoids float drift (0.1 + 0.2 style inputs)", () => {
    expect(parseMajorToMinor("0.29")).toBe(29);
    expect(parseMajorToMinor("1.15")).toBe(115);
  });
});

describe("bpsOf", () => {
  it("floors, never rounds", () => {
    expect(bpsOf(30000, 100)).toBe(300);
    expect(bpsOf(100, 350)).toBe(3); // 3.5 → 3
    expect(bpsOf(99, 100)).toBe(0); // 0.99 → 0
  });

  it("floors per amount, not on a sum", () => {
    const perPayment = [100, 100, 100].reduce((sum, a) => sum + bpsOf(a, 350), 0);
    expect(perPayment).toBe(9);
    expect(bpsOf(300, 350)).toBe(10);
  });

  it("rejects non-integer inputs", () => {
    expect(() => bpsOf(10.5, 100)).toThrow(TypeError);
    expect(() => bpsOf(100, 1.5)).toThrow(RangeError);
  });
});

describe("formatSLE", () => {
  it.each([
    [0, "Le 0.00"],
    [5, "Le 0.05"],
    [125075, "Le 1,250.75"],
    [100000000, "Le 1,000,000.00"],
    [-2550, "-Le 25.50"],
  ])("%i → %s", (minor, text) => {
    expect(formatSLE(minor)).toBe(text);
  });
});

describe("assertMinor", () => {
  it("accepts safe integers and rejects floats/NaN/strings", () => {
    expect(() => assertMinor(100)).not.toThrow();
    expect(() => assertMinor(1.1)).toThrow();
    expect(() => assertMinor(Number.NaN)).toThrow();
    expect(() => assertMinor("100")).toThrow();
    expect(() => assertMinor(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });
});

describe("formatMajorInput", () => {
  it.each([
    [123400, "1234"],
    [5050, "50.50"],
    [5005, "50.05"],
    [0, "0"],
  ])("formats %i → %j and parses back", (minor, text) => {
    expect(formatMajorInput(minor)).toBe(text);
    expect(parseMajorToMinor(text)).toBe(minor);
  });
});
