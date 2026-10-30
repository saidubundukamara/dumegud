// The downloadable brand kit: every logo variation, the background it's made for, and the files
// each one ships as. scripts/brand-assets.ts builds and uploads these files; the /brand page lists
// them. Colours are named, not hex: maroon and orange come from styles/tokens.css.

import { appIconSvg, logomarkSvg, MARK_BOX, WORDMARK_BOX, wordmarkSvg } from "./brand-logo";

/** Bump when the artwork changes, so cached downloads never serve the old logo. */
export const BRAND_KIT_VERSION = "v1";

/** Where the kit lives in the public R2 bucket. */
export const BRAND_KIT_PREFIX = `brand/${BRAND_KIT_VERSION}`;

export const BRAND_KIT_ZIP = "dumegud-brand-kit.zip";

/** `primary` is the maroon and `secondary` the orange token. */
export type BrandColour = "primary" | "secondary" | "black" | "white";

/** The background a variation is designed for. */
export type BrandBackdrop = "light" | "dark" | "primary" | "secondary";

export type BrandAsset = {
  slug: string;
  label: string;
  backdrop: BrandBackdrop;
} & (
  | { kind: "wordmark"; base: BrandColour; accent: BrandColour }
  | { kind: "logomark"; fill: BrandColour }
  | { kind: "app-icon"; tile: BrandColour; mark: BrandColour }
);

export type BrandAssetKind = BrandAsset["kind"];

export const BRAND_ASSETS: readonly BrandAsset[] = [
  {
    kind: "wordmark",
    slug: "dumegud-wordmark-maroon-orange",
    label: "Maroon and orange",
    backdrop: "light",
    base: "primary",
    accent: "secondary",
  },
  {
    kind: "wordmark",
    slug: "dumegud-wordmark-black-maroon",
    label: "Black and maroon",
    backdrop: "light",
    base: "black",
    accent: "primary",
  },
  {
    kind: "wordmark",
    slug: "dumegud-wordmark-black-orange",
    label: "Black and orange",
    backdrop: "light",
    base: "black",
    accent: "secondary",
  },
  {
    kind: "wordmark",
    slug: "dumegud-wordmark-white-orange",
    label: "White and orange",
    backdrop: "dark",
    base: "white",
    accent: "secondary",
  },
  {
    kind: "wordmark",
    slug: "dumegud-wordmark-white-black",
    label: "White and black",
    backdrop: "secondary",
    base: "white",
    accent: "black",
  },
  {
    kind: "logomark",
    slug: "dumegud-logomark-maroon",
    label: "Maroon",
    backdrop: "light",
    fill: "primary",
  },
  {
    kind: "logomark",
    slug: "dumegud-logomark-orange",
    label: "Orange",
    backdrop: "light",
    fill: "secondary",
  },
  {
    kind: "logomark",
    slug: "dumegud-logomark-black",
    label: "Black",
    backdrop: "light",
    fill: "black",
  },
  {
    kind: "logomark",
    slug: "dumegud-logomark-white",
    label: "White",
    backdrop: "primary",
    fill: "white",
  },
  {
    kind: "app-icon",
    slug: "dumegud-app-icon-maroon",
    label: "Maroon",
    backdrop: "light",
    tile: "primary",
    mark: "white",
  },
  {
    kind: "app-icon",
    slug: "dumegud-app-icon-orange",
    label: "Orange",
    backdrop: "light",
    tile: "secondary",
    mark: "white",
  },
  {
    kind: "app-icon",
    slug: "dumegud-app-icon-maroon-orange",
    label: "Maroon and orange",
    backdrop: "light",
    tile: "primary",
    mark: "secondary",
  },
];

/**
 * The email header logo. PNG because mail apps don't show SVG, drawn at 3x the display width so
 * it stays sharp on phones. Light for the normal scheme, dark for mail apps in dark mode. Not part
 * of the downloadable kit; uploaded next to it.
 */
export const EMAIL_LOGO = {
  width: 140,
  scale: 3,
  light: { file: "dumegud-email-wordmark-maroon-orange.png", base: "primary", accent: "secondary" },
  dark: { file: "dumegud-email-wordmark-white-orange.png", base: "white", accent: "secondary" },
} as const;

/** PNG sizes (long side, in pixels) exported for every variation, next to the SVG. */
export const BRAND_PNG_SIZES = [1024, 2048] as const;

export type BrandFile = { name: string; format: "SVG" | "PNG"; size?: number };

export function brandAssetFiles(asset: BrandAsset): BrandFile[] {
  return [
    { name: `${asset.slug}.svg`, format: "SVG" },
    ...BRAND_PNG_SIZES.map((size) => ({
      name: `${asset.slug}-${size}.png`,
      format: "PNG" as const,
      size,
    })),
  ];
}

/** The token values behind `primary` and `secondary` (read from styles/tokens.css by the caller). */
export type BrandPalette = { primary: string; secondary: string };

export function brandColourValue(colour: BrandColour, palette: BrandPalette): string {
  if (colour === "black") return "#000000";
  if (colour === "white") return "#ffffff";
  return palette[colour];
}

/** One variation as a standalone SVG document; `longSide` sets its size in pixels (for rasterising). */
export function brandAssetSvg(asset: BrandAsset, palette: BrandPalette, longSide?: number): string {
  const c = (colour: BrandColour) => brandColourValue(colour, palette);
  switch (asset.kind) {
    case "wordmark":
      return wordmarkSvg({
        base: c(asset.base),
        accent: c(asset.accent),
        size: longSide ? scaled(longSide, WORDMARK_BOX) : undefined,
      });
    case "logomark":
      return logomarkSvg({
        fill: c(asset.fill),
        size: longSide ? scaled(longSide, MARK_BOX) : undefined,
      });
    case "app-icon":
      return appIconSvg({
        tile: c(asset.tile),
        mark: c(asset.mark),
        size: longSide,
      });
  }
}

/** Pixel size with `longSide` on the longer edge, keeping the box proportions. */
function scaled(longSide: number, box: { width: number; height: number }) {
  const k = longSide / Math.max(box.width, box.height);
  return {
    width: Math.round(box.width * k),
    height: Math.round(box.height * k),
  };
}
