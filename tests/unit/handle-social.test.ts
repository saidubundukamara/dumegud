import { describe, expect, it } from "vitest";
import { handleFormatError, normalizeHandle } from "@/lib/handle";
import { parseSocialUrl } from "@/lib/social";

describe("handles", () => {
  it("normalises @ and case", () => {
    expect(normalizeHandle("  @AminataK ")).toBe("aminatak");
  });

  it.each(["abc", "aminata_k", "dj2026", "a".repeat(30)])("accepts %s", (h) => {
    expect(handleFormatError(h)).toBeNull();
  });

  it.each([
    ["ab", /at least 3/],
    ["a".repeat(31), /at most 30/],
    ["_amina", /starting and ending/],
    ["amina_", /starting and ending/],
    ["ami-na", /letters, numbers/],
    ["amí", /letters, numbers/],
    ["ami__na", /two underscores/],
    ["dashboard", /isn't available/],
    ["login", /isn't available/],
  ])("rejects %s", (h, message) => {
    expect(handleFormatError(h)).toMatch(message);
  });
});

describe("parseSocialUrl", () => {
  it("adds https:// to bare domains", () => {
    expect(parseSocialUrl("website", "aminata.sl")).toEqual({ url: "https://aminata.sl/" });
  });

  it.each(["javascript:alert(1)", "data:text/html,<script>", "http://insecure.example", "https://user:pass@example.com"])(
    "rejects %s",
    (url) => {
      expect(parseSocialUrl("website", url)).toHaveProperty("error");
    },
  );

  it("requires the platform's own host", () => {
    expect(parseSocialUrl("instagram", "https://www.instagram.com/aminata")).toEqual({ url: "https://www.instagram.com/aminata" });
    expect(parseSocialUrl("instagram", "https://instagram.com.evil.example/x")).toHaveProperty("error");
    expect(parseSocialUrl("youtube", "youtu.be/abc")).toEqual({ url: "https://youtu.be/abc" });
  });
});
