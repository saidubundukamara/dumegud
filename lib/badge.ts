import { MARK_BOX, MARK_PATHS, MARK_VIEWBOX } from "@/lib/brand-logo";

/** Colour values by token name (`primary`, `secondary-foreground` …), as read from styles/tokens.css. */
type BrandTokens = Record<string, string>;

// The "Support me on DuMeGud" badge creators put in a GitHub README or on their site, drawn like
// a shields.io badge: [logomark DuMeGud | @handle]. A hand-built SVG string (no Satori) so it stays
// a few hundred bytes and scales cleanly. SVG viewers pick the font themselves, so the text width
// is estimated from Verdana's metrics (as shields.io does) and pinned with textLength, which
// keeps the layout the same whichever fallback font renders it. Colours come from the tokens.

export const BADGE_SIZES = ["sm", "lg"] as const;
export type BadgeSize = (typeof BADGE_SIZES)[number];

type Metrics = { height: number; fontSize: number; padX: number; mark: number; gap: number; radius: number };

export const BADGE_METRICS: Record<BadgeSize, Metrics> = {
  sm: { height: 20, fontSize: 11, padX: 6, mark: 12, gap: 4, radius: 3 },
  lg: { height: 32, fontSize: 15, padX: 10, mark: 18, gap: 6, radius: 5 },
};

export const BADGE_LABEL = "DuMeGud";

// Verdana advance widths at 11px. Anything missing falls back to an average lowercase width.
const VERDANA_11: Record<string, number> = {
  a: 6.8, b: 6.9, c: 5.8, d: 6.9, e: 6.6, f: 3.8, g: 6.9, h: 7, i: 3, j: 3.8, k: 6.5, l: 3, m: 10.7,
  n: 7, o: 6.7, p: 6.9, q: 6.9, r: 4.7, s: 5.7, t: 4.3, u: 7, v: 6.5, w: 9, x: 6.5, y: 6.5, z: 5.8,
  "0": 7, "1": 7, "2": 7, "3": 7, "4": 7, "5": 7, "6": 7, "7": 7, "8": 7, "9": 7,
  _: 7, "@": 11, " ": 3.9, D: 8.4, M: 9.5, G: 8.5,
};
const FALLBACK_WIDTH = 6.6;

/** Estimated rendered width of `text` at `fontSize`, in px. */
export function textWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) w += VERDANA_11[ch] ?? FALLBACK_WIDTH;
  return (w * fontSize) / 11;
}

export function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** Accessible name of the badge, also used as the image alt text in the snippets. */
export function badgeAlt(handle: string): string {
  return `Support @${handle} on DuMeGud`;
}

export type BadgeLayout = ReturnType<typeof badgeLayout>;

/** Box sizes shared by the SVG and the PNG, so both look the same. */
export function badgeLayout(handle: string, size: BadgeSize) {
  const m = BADGE_METRICS[size];
  const value = `@${handle}`;
  const markWidth = (m.mark * MARK_BOX.width) / MARK_BOX.height;
  const labelText = Math.round(textWidth(BADGE_LABEL, m.fontSize));
  const valueText = Math.round(textWidth(value, m.fontSize));
  const left = Math.round(m.padX + markWidth + m.gap + labelText + m.padX);
  const right = valueText + m.padX * 2;
  return { ...m, value, markWidth, labelText, valueText, left, right, width: left + right };
}

/** The badge as a standalone SVG document. */
export function renderBadgeSvg({ handle, size, tokens }: { handle: string; size: BadgeSize; tokens: BrandTokens }): string {
  const l = badgeLayout(handle, size);
  const t = {
    labelBg: tokens.primary,
    labelFg: tokens["primary-foreground"],
    valueBg: tokens.secondary,
    valueFg: tokens["secondary-foreground"],
  };
  const alt = escapeXml(badgeAlt(handle));
  const baseline = Math.round(l.height / 2 + l.fontSize * 0.35);
  const markY = (l.height - l.mark) / 2;
  const labelX = l.padX + l.markWidth + l.gap;
  const paths = MARK_PATHS.map((d) => `<path d="${d}"/>`).join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${l.width}" height="${l.height}" viewBox="0 0 ${l.width} ${l.height}" role="img" aria-label="${alt}">`,
    `<title>${alt}</title>`,
    `<clipPath id="r"><rect width="${l.width}" height="${l.height}" rx="${l.radius}"/></clipPath>`,
    `<g clip-path="url(#r)">`,
    `<rect width="${l.left}" height="${l.height}" fill="${t.labelBg}"/>`,
    `<rect x="${l.left}" width="${l.right}" height="${l.height}" fill="${t.valueBg}"/>`,
    `</g>`,
    `<svg x="${l.padX}" y="${markY}" width="${l.markWidth.toFixed(2)}" height="${l.mark}" viewBox="${MARK_VIEWBOX}" fill="${t.labelFg}">${paths}</svg>`,
    `<g font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="${l.fontSize}" text-rendering="geometricPrecision">`,
    `<text x="${labelX.toFixed(2)}" y="${baseline}" fill="${t.labelFg}" textLength="${l.labelText}" lengthAdjust="spacingAndGlyphs">${BADGE_LABEL}</text>`,
    `<text x="${l.left + l.padX}" y="${baseline}" fill="${t.valueFg}" textLength="${l.valueText}" lengthAdjust="spacingAndGlyphs">${escapeXml(l.value)}</text>`,
    `</g>`,
    `</svg>`,
  ].join("");
}
