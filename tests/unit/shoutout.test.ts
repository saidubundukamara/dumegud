import { describe, expect, it } from "vitest";
import { buildCaption, mentionFor, mentionList, parseShoutoutHandle } from "@/lib/shoutout";
import { detectSource } from "@/lib/traffic-source";
import { parseTokens } from "@/server/lib/brand-tokens";
import type { ShoutoutCandidate } from "@/server/repositories/ShoutoutRepository";
import { rankTopSupporters } from "@/server/services/ShoutoutService";

const TIKTOK_UA =
  "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 musical_ly_2023 BytedanceWebview/d8a21c6";
const IG_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Instagram 300.0.0.0";
const FB_UA = "Mozilla/5.0 (iPhone) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0]";

describe("detectSource", () => {
  it("prefers the share link, then the in-app browser, then the referrer", () => {
    expect(detectSource({ via: "instagram", userAgent: TIKTOK_UA, referrer: "https://www.facebook.com/" })).toBe("instagram");
    expect(detectSource({ via: null, userAgent: TIKTOK_UA, referrer: "https://www.facebook.com/" })).toBe("tiktok");
    expect(detectSource({ userAgent: "Mozilla/5.0 Safari", referrer: "https://l.facebook.com/l.php" })).toBe("facebook");
  });

  it("recognises in-app browsers", () => {
    expect(detectSource({ userAgent: IG_UA })).toBe("instagram");
    expect(detectSource({ userAgent: FB_UA })).toBe("facebook");
  });

  it("ignores junk and treats same-site or missing referrers as direct", () => {
    expect(detectSource({ via: "<script>", userAgent: "Mozilla/5.0" })).toBe("direct");
    expect(detectSource({ via: "direct" })).toBe("direct");
    expect(detectSource({ referrer: "https://dumegud.com/x", ownHost: "dumegud.com" })).toBe("direct");
    expect(detectSource({ referrer: "https://news.example.org/" })).toBe("other");
    expect(detectSource({ referrer: "not a url" })).toBe("direct");
  });
});

describe("parseShoutoutHandle", () => {
  it("strips @, lower-cases and accepts pasted profile links", () => {
    expect(parseShoutoutHandle("tiktok", "  @Kadi.Sl ")).toEqual({ handle: "kadi.sl" });
    expect(parseShoutoutHandle("instagram", "https://www.instagram.com/kadi_sl/")).toEqual({ handle: "kadi_sl" });
    expect(parseShoutoutHandle("tiktok", "https://www.tiktok.com/@kadi.sl?lang=en")).toEqual({ handle: "kadi.sl" });
  });

  it("rejects what the platform wouldn't allow", () => {
    expect(parseShoutoutHandle("x", "this_is_far_too_long_for_x")).toHaveProperty("error");
    expect(parseShoutoutHandle("tiktok", "has space")).toHaveProperty("error");
    expect(parseShoutoutHandle("instagram", "@")).toHaveProperty("error");
  });
});

describe("caption", () => {
  const people = [
    { name: "Kadiatu", platform: "tiktok" as const, handle: "kadi.sl" },
    { name: "Mohamed", platform: "instagram" as const, handle: "mo_sl" },
    { name: null, platform: "instagram" as const, handle: "anon_ig" },
    { name: "Fatmata", platform: null, handle: null },
    { name: "Kadiatu", platform: "tiktok" as const, handle: "kadi.sl" },
  ];

  it("only @mentions people on the platform being posted to", () => {
    expect(mentionFor(people[0], "tiktok")).toBe("@kadi.sl");
    expect(mentionFor(people[1], "tiktok")).toBe("Mohamed");
    expect(mentionFor(people[2], "tiktok")).toBe("anon_ig (Instagram)");
    expect(mentionList(people, "tiktok")).toEqual(["@kadi.sl", "Mohamed", "anon_ig (Instagram)", "Fatmata"]);
  });

  it("adds the attributed page link and the ranked top supporters without amounts", () => {
    const caption = buildCaption({
      style: "warm",
      platform: "tiktok",
      period: "week",
      people,
      top: [people[1], people[0]],
      pageUrl: "dumegud.com/aminata",
    });
    expect(caption).toContain("this week");
    expect(caption).toContain("dumegud.com/aminata?via=tiktok");
    expect(caption).toContain("🥇 Mohamed");
    expect(caption).toContain("🥈 @kadi.sl");
    expect(caption).not.toMatch(/Le|SLE|\d{3,}/);
  });
});

describe("rankTopSupporters", () => {
  const c = (id: string, payer: string | null, gross: number, handle: string | null, name: string | null = null): ShoutoutCandidate => ({
    contributionId: id,
    paymentId: id,
    supporterName: name,
    socialPlatform: handle ? "tiktok" : null,
    socialHandle: handle,
    grossMinor: gross,
    payerFingerprintHash: payer,
    settledAt: new Date(),
    thankedAt: null,
  });

  it("groups by mobile-money payer, so typing someone's handle can't take their place", () => {
    const top = rankTopSupporters(
      [
        c("1", "payer-a", 5_000, "small_giver"),
        c("2", "payer-b", 20_000, "big_giver"),
        c("3", "payer-a", 30_000, "small_giver"),
        c("4", "payer-c", 25_000, "big_giver"), // a different payer claiming the same handle
      ],
      "tiktok",
    );
    expect(top.map((p) => p.handle)).toEqual(["small_giver", "big_giver", "big_giver"]);
  });

  it("needs at least two supporters to rank", () => {
    expect(rankTopSupporters([c("1", "payer-a", 5_000, "solo")], "tiktok")).toEqual([]);
  });
});

describe("brand tokens", () => {
  it("reads --dmg-* values from the first :root block", () => {
    expect(parseTokens(":root {\n  --dmg-primary: #ff7f63;\n  --dmg-primary-foreground:#2e2e2e;\n}\n.dark { --dmg-primary: #000; }")).toEqual({
      primary: "#ff7f63",
      "primary-foreground": "#2e2e2e",
    });
  });
});
