import "server-only";
import { cacheLife } from "next/cache";
import { renderBadgeSvg, type BadgeSize } from "@/lib/badge";
import { BRAND_KIT_PREFIX, type BrandPalette } from "@/lib/brand-kit";
import { brandTokens } from "./brand-tokens";

// Read straight from process.env, not getEnv(), like server/lib/site.ts: /brand is prerendered
// at build time, where the rest of the env isn't present and getEnv() throws.

/** Public URL of a kit file (uploaded by `npm run brand:upload`), or null while R2 isn't set up. */
export function brandKitUrl(file: string): string | null {
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  return base ? `${base}/${BRAND_KIT_PREFIX}/${file}` : null;
}

/** The maroon and orange hex values from styles/tokens.css, for the colour swatches on /brand. */
export async function getCachedBrandPalette(): Promise<BrandPalette> {
  "use cache";
  cacheLife("max");
  const t = await brandTokens();
  return { primary: t.primary, secondary: t.secondary };
}

/** Sample badges for the /brand badge builder, as SVG data URIs (shown until a handle is typed). */
export async function getCachedBadgeSamples(): Promise<Record<BadgeSize, string>> {
  "use cache";
  cacheLife("max");
  const tokens = await brandTokens();
  const sample = (size: BadgeSize) =>
    `data:image/svg+xml,${encodeURIComponent(renderBadgeSvg({ handle: "yourhandle", size, tokens }))}`;
  return { sm: sample("sm"), lg: sample("lg") };
}
