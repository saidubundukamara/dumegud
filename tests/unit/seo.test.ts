import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import { pageMetadata, toDescription } from "@/lib/seo";
import { absoluteUrl, isIndexable } from "@/server/lib/site";

afterEach(() => {
  vi.unstubAllEnvs();
});

function production(base = "https://dumegud.com") {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("APP_BASE_URL", base);
}

describe("indexing", () => {
  it("only lets the production site be indexed", () => {
    production();
    expect(isIndexable()).toBe(true);

    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isIndexable()).toBe(false);

    production("http://localhost:3000");
    expect(isIndexable()).toBe(false);
  });

  it("robots.txt keeps private areas out and points at the sitemap in production", () => {
    production();
    const r = robots();
    expect(r.sitemap).toBe("https://dumegud.com/sitemap.xml");
    const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rules.disallow).toEqual(expect.arrayContaining(["/dashboard", "/admin", "/api/", "/library"]));
  });

  it("robots.txt blocks everything outside production", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });

  it("builds absolute URLs from APP_BASE_URL", () => {
    production();
    expect(absoluteUrl("/kotor_saedu")).toBe("https://dumegud.com/kotor_saedu");
  });
});

describe("pageMetadata", () => {
  it("keeps the shared Open Graph fields and the large card on every page", () => {
    const m = pageMetadata({ title: "Fees", description: "Free to join.", path: "/pricing" });
    expect(m.alternates?.canonical).toBe("/pricing");
    expect(m.openGraph).toMatchObject({ siteName: "DuMeGud", url: "/pricing", title: "Fees · DuMeGud" });
    expect(m.twitter).toMatchObject({ card: "summary_large_image" });
  });
});

describe("toDescription", () => {
  it("flattens whitespace and cuts at a word", () => {
    expect(toDescription("  Singer\\n from   Freetown ".replace("\\n", "\n"))).toBe("Singer from Freetown");
    const long = "word ".repeat(60);
    const out = toDescription(long, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });
});
