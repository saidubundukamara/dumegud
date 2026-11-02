import { describe, expect, it } from "vitest";
import { handleFormatError, normalizeHandle } from "@/lib/handle";
import { parseSocialInput, parseSocialUrl, usernameFromUrl } from "@/lib/social";

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

describe("parseSocialInput", () => {
  it.each([
    ["instagram", "aminata", "https://www.instagram.com/aminata"],
    ["instagram", " @Aminata.K ", "https://www.instagram.com/Aminata.K"],
    ["tiktok", "@aminata", "https://www.tiktok.com/@aminata"],
    ["youtube", "aminata-music", "https://www.youtube.com/@aminata-music"],
    ["x", "aminata_k", "https://x.com/aminata_k"],
    ["facebook", "aminata.kamara", "https://www.facebook.com/aminata.kamara"],
    ["soundcloud", "aminata", "https://soundcloud.com/aminata"],
    ["linkedin", "aminata-kamara", "https://www.linkedin.com/in/aminata-kamara"],
  ] as const)("builds the %s link from %s", (platform, input, url) => {
    expect(parseSocialInput(platform, input)).toEqual({ url });
  });

  it("still accepts a pasted link, with the host check", () => {
    expect(parseSocialInput("instagram", "instagram.com/aminata")).toEqual({ url: "https://instagram.com/aminata" });
    expect(parseSocialInput("instagram", "https://instagram.com.evil.example/x")).toHaveProperty("error");
    expect(parseSocialInput("tiktok", "https://evil.example")).toHaveProperty("error");
  });

  it("rejects usernames that can't be right, naming the platform", () => {
    expect(parseSocialInput("instagram", "ami nata")).toEqual({ error: expect.stringMatching(/Instagram username/) });
    expect(parseSocialInput("x", "a".repeat(16))).toHaveProperty("error");
    expect(parseSocialInput("tiktok", "@")).toHaveProperty("error");
    expect(parseSocialInput("instagram", "")).toHaveProperty("error");
  });

  it("keeps Spotify and websites link-only", () => {
    expect(parseSocialInput("website", "aminata.sl")).toEqual({ url: "https://aminata.sl/" });
    expect(parseSocialInput("spotify", "aminata")).toHaveProperty("error");
  });
});

describe("usernameFromUrl", () => {
  it.each([
    ["instagram", "aminata"],
    ["tiktok", "aminata"],
    ["youtube", "aminata-music"],
    ["x", "aminata_k"],
    ["facebook", "aminata.kamara"],
    ["soundcloud", "aminata"],
    ["linkedin", "aminata-kamara"],
  ] as const)("round-trips %s", (platform, username) => {
    const parsed = parseSocialInput(platform, username);
    expect("url" in parsed && usernameFromUrl(platform, parsed.url)).toBe(username);
  });

  it("returns null for links that aren't a plain profile", () => {
    expect(usernameFromUrl("youtube", "https://www.youtube.com/channel/UC123")).toBeNull();
    expect(usernameFromUrl("facebook", "https://www.facebook.com/profile.php?id=1")).toBeNull();
    expect(usernameFromUrl("website", "https://aminata.sl/")).toBeNull();
    expect(usernameFromUrl("spotify", "https://open.spotify.com/artist/abc")).toBeNull();
  });
});
