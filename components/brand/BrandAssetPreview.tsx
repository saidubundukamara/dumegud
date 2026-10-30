import type { BrandAsset, BrandColour } from "@/lib/brand-kit";
import {
  appIconLayout,
  MARK_PATHS,
  MARK_VIEWBOX,
  WORDMARK_ACCENT_PATHS,
  WORDMARK_BASE_PATHS,
  WORDMARK_VIEWBOX,
} from "@/lib/brand-logo";

// The same artwork as the downloadable file, drawn inline with token fills, so the preview on
// /brand always matches the current palette.

const FILL: Record<BrandColour, string> = {
  primary: "fill-primary",
  secondary: "fill-secondary",
  black: "fill-black",
  white: "fill-white",
};

const Paths = ({ ds, colour }: { ds: readonly string[]; colour: BrandColour }) => (
  <g className={FILL[colour]}>
    {ds.map((d) => (
      <path key={d} d={d} />
    ))}
  </g>
);

export function BrandAssetPreview({ asset, className = "" }: { asset: BrandAsset; className?: string }) {
  const svg = { className: `block ${className}`, "aria-hidden": true } as const;
  switch (asset.kind) {
    case "wordmark":
      return (
        <svg viewBox={WORDMARK_VIEWBOX} {...svg}>
          <Paths ds={WORDMARK_BASE_PATHS} colour={asset.base} />
          <Paths ds={WORDMARK_ACCENT_PATHS} colour={asset.accent} />
        </svg>
      );
    case "logomark":
      return (
        <svg viewBox={MARK_VIEWBOX} {...svg}>
          <Paths ds={MARK_PATHS} colour={asset.fill} />
        </svg>
      );
    case "app-icon": {
      const { side, radius, transform } = appIconLayout();
      return (
        <svg viewBox={`0 0 ${side} ${side}`} {...svg}>
          <rect width={side} height={side} rx={radius} className={FILL[asset.tile]} />
          <g transform={transform}>
            <Paths ds={MARK_PATHS} colour={asset.mark} />
          </g>
        </svg>
      );
    }
  }
}
