import { afterEach, describe, expect, it, vi } from "vitest";
import { BRAND_ASSETS, BRAND_KIT_PREFIX, brandAssetFiles, brandAssetSvg } from "@/lib/brand-kit";
import { appIconLayout, MARK_BOX } from "@/lib/brand-logo";
import { ROUTE_HANDLES } from "@/lib/handle";
import { brandKitUrl } from "@/server/lib/brand-kit";

const palette = { primary: "#8f0100", secondary: "#ff7300" };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("brand kit", () => {
  it("gives every file a unique name", () => {
    const names = BRAND_ASSETS.flatMap((a) => brandAssetFiles(a).map((f) => f.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it("fills variations with the palette, never another brand colour", () => {
    const svg = brandAssetSvg(BRAND_ASSETS.find((a) => a.slug === "dumegud-wordmark-maroon-orange")!, palette);
    const fills = new Set([...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]));
    expect(fills).toEqual(new Set(["#8f0100", "#ff7300"]));
  });

  it("sizes the long side for rasterising and keeps the proportions", () => {
    const svg = brandAssetSvg(BRAND_ASSETS.find((a) => a.kind === "logomark")!, palette, 1024);
    expect(svg).toContain('height="1024"');
    expect(svg).toContain(`width="${Math.round((1024 * MARK_BOX.width) / MARK_BOX.height)}"`);
  });

  it("centres the mark on the app icon tile", () => {
    const { side, transform } = appIconLayout();
    const [x, y] = /translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(transform)!.slice(1).map(Number);
    expect(x + MARK_BOX.x + MARK_BOX.width / 2).toBeCloseTo(side / 2, 1);
    expect(y + MARK_BOX.y + MARK_BOX.height / 2).toBeCloseTo(side / 2, 1);
  });

  it("links downloads to the public bucket, or nowhere while R2 isn't set up", () => {
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://cdn.dumegud.com/");
    expect(brandKitUrl("a.svg")).toBe(`https://cdn.dumegud.com/${BRAND_KIT_PREFIX}/a.svg`);
    vi.stubEnv("R2_PUBLIC_BASE_URL", "");
    expect(brandKitUrl("a.svg")).toBeNull();
  });

  it("keeps /brand out of the creator handles", () => {
    expect(ROUTE_HANDLES.has("brand")).toBe(true);
  });
});
