import { describe, expect, it } from "vitest";
import { BADGE_METRICS, badgeLayout, escapeXml, renderBadgeSvg } from "@/lib/badge";
import { MARK_PATHS } from "@/lib/brand-logo";
import { detectSource } from "@/lib/traffic-source";

const tokens = {
  primary: "#8f0100",
  "primary-foreground": "#ffffff",
  secondary: "#ff7300",
  "secondary-foreground": "#1a1514",
};

describe("support badge", () => {
  it("shows the handle, the logomark and an accessible name", () => {
    const svg = renderBadgeSvg({ handle: "aminata", size: "sm", tokens });
    expect(svg).toContain(">@aminata</text>");
    expect(svg).toContain(">DuMeGud</text>");
    expect(svg).toContain('aria-label="Support @aminata on DuMeGud"');
    expect(svg).toContain("<title>Support @aminata on DuMeGud</title>");
    for (const d of MARK_PATHS) expect(svg).toContain(d);
  });

  it("uses the size's height", () => {
    for (const size of ["sm", "lg"] as const) {
      const svg = renderBadgeSvg({ handle: "aminata", size, tokens });
      expect(svg).toMatch(new RegExp(`^<svg[^>]* height="${BADGE_METRICS[size].height}"`));
    }
  });

  it("grows with the handle", () => {
    expect(badgeLayout("abcdefghijklmnop", "sm").width).toBeGreaterThan(badgeLayout("abc", "sm").width);
    expect(badgeLayout("abc", "lg").width).toBeGreaterThan(badgeLayout("abc", "sm").width);
  });

  it("only uses token colours", () => {
    const svg = renderBadgeSvg({ handle: "aminata", size: "lg", tokens });
    const colours = new Set(svg.match(/#[0-9a-f]{3,8}\b/gi)?.map((c) => c.toLowerCase()));
    expect([...colours].every((c) => Object.values(tokens).includes(c))).toBe(true);
  });

  it("escapes text", () => {
    expect(escapeXml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;");
    expect(renderBadgeSvg({ handle: "a<b", size: "sm", tokens })).not.toContain("a<b");
  });

  it("credits the badge as the traffic source", () => {
    expect(detectSource({ via: "badge", referrer: "https://github.com/" })).toBe("badge");
  });
});
