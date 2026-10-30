// The DuMeGud logo as vector paths, traced from the master artwork (Dumegud.ai, artboard 1) in one
// coordinate space: the wordmark box starts at 0,0 and the logomark is the "M" with its two dots
// inside it. Colours are never baked in: the site fills these with token utilities, and the brand
// kit, icons and share cards pass the values from styles/tokens.css. Regenerate the kit after any
// change here: npm run brand:build.

/** Size of the full "DuMeGud" wordmark. */
export const WORDMARK_BOX = { width: 793.18, height: 170.01 } as const;

/** Where the logomark sits inside the wordmark (it is the "M" of "Me"). */
export const MARK_BOX = {
  x: 245.69,
  y: 0,
  width: 127.57,
  height: 167.6,
} as const;

/** "Du" and "Gud": the base colour (maroon on light backgrounds, white on dark). */
export const WORDMARK_BASE_PATHS = [
  "M72.67 127.78C82.69 122 88.12 108.24 87.96 96.86C87.62 74.27 60.44 60.85 62.82 88.54C63.32 93.8 65.02 123.36 66.04 128.62C66.55 131.17 70.29 129.14 72.67 127.78M24.76 167.87C23.07 167.53 21.2 167.01 19.5 166.17C15.76 165.49 11.85 163.96 8.97 161.41C7.1 159.71 5.74 157.5 5.23 155.12C3.36 148.67 4.38 141.37 6.93 135.25C7.44 134.06 7.95 133.04 8.8 132.36C9.82 131.51 11.35 131 12.71 130.83C18.65 129.98 24.76 130.16 30.71 129.3C30.88 129.3 31.05 129.3 31.05 129.14C33.26 114.53 32.58 99.24 28.67 84.97C27.14 79.71 19.33 84.8 13.73 84.29C3.87 83.61 -0.88 67.64 0.14 57.62C1.16 47.26 15.08 42.17 24.76 38.09C60.61 22.97 103.41 31.63 118.87 67.3C133.48 100.77 121.59 141.71 94.41 159.2C74.71 171.77 47.87 171.43 24.76 167.87",
  "M187.84 150.88C170.17 173.98 136.88 163.11 133.32 134.06C131.62 119.96 134.84 105.69 133.82 91.42C132.81 74.61 134.5 51.85 154.55 53.55C181.73 55.75 170.85 73.93 167.29 91.08C157.94 136.44 177.14 138.31 182.58 112.66C184.96 101.45 182.41 64.59 191.92 58.3C204.49 49.98 224.53 53.72 223.85 68.66C223 86.33 214.34 104.67 219.44 121.66C221.64 128.96 228.78 133.89 231.83 140.69C234.55 147.14 230.31 155.8 225.21 160.56C214 171.09 195.66 164.13 187.84 150.88",
  "M486.45 142.21C470.14 114.36 475.07 67.64 499.19 46.24C526.71 21.95 588.19 32.99 573.58 81.23C570.19 91.94 547.6 93.3 538.76 89.05C530.78 83.27 536.22 77.33 535.03 71.38C534.01 67.48 528.57 67.48 524.83 68.83C519.74 70.7 517.7 76.99 515.83 82.08C511.08 95.33 509.89 111.64 516.34 124.04C523.65 138.31 544.2 142.39 551.67 128.29C552.01 127.61 551.5 123.7 551.84 123.02C542.16 125.06 528.4 130.16 526.71 120.47C525.69 115.21 524.83 102.47 528.57 98.56C531.97 95.16 544.71 95.5 549.64 95.5C557.28 95.5 572.57 94.99 575.96 101.96C582.93 116.23 577.16 143.74 565.94 155.12C544.2 177.21 502.92 170.58 486.45 142.21",
  "M642.56 150.88C624.89 173.98 591.6 163.11 588.03 134.06C586.33 119.96 589.56 105.69 588.54 91.42C587.52 74.61 589.22 51.85 609.26 53.55C636.44 55.75 625.57 73.93 622 91.08C612.66 136.44 631.85 138.31 637.29 112.66C639.67 101.45 637.12 64.59 646.63 58.3C659.2 49.98 679.25 53.72 678.57 68.66C677.72 86.33 669.05 104.67 674.15 121.66C676.36 128.96 683.49 133.89 686.55 140.69C689.27 147.14 685.02 155.8 679.92 160.56C668.71 171.09 650.37 164.13 642.56 150.88",
  "M742.1 127.78C747.54 117.92 743.12 100.77 732.59 104.85C728 106.54 727.49 114.36 728 119.11C729.19 128.96 737.35 136.44 742.1 127.78M764.69 166.17C757.9 164.98 752.3 157.33 750.94 150.54C742.78 164.13 720.19 167.35 707.79 156.82C667.19 122.17 707.45 57.79 752.3 86.67C754.5 82.25 756.2 72.57 753.48 68.49C752.63 67.14 747.71 66.8 746.18 66.29C737.01 63.06 735.31 51 740.74 43.01C746.86 33.67 765.71 33.16 776.42 36.22C793.74 40.98 795.78 60.17 790.85 77.33C785.93 94.32 779.98 112.15 782.19 129.65C783.21 136.78 787.12 143.23 789.83 149.86C794.59 162.09 777.77 168.55 764.69 166.17",
] as const;

/** The "M" and its two dots: the logomark, and the accent of the wordmark. */
export const MARK_PATHS = [
  "M372.5 138.54C371.91 144.02 370.07 157.05 367.6 161.57C364.55 167.11 356.9 168.39 352.1 164.39C345.89 159.2 349.59 151.15 349.5 144.25L349.5 133.11C348.39 126.22 350.43 112.65 340.77 111.33C331.55 110.06 328.54 120.66 323.11 126.19C321.26 127.03 319.37 127.69 317.37 127.6C316.29 127.55 315.26 127.28 314.29 126.83C310.56 126.64 307.22 123.39 305.46 119.89C302.68 114.37 302.23 107.98 300.16 102.16C299.74 100.97 299.17 99.71 298.48 98.49L298.68 98.59C298.58 98.48 298.47 98.37 298.36 98.27C295.56 93.44 290.84 89.32 285.32 92.31C277.87 96.36 276.23 103.57 275.68 111.36C275.66 111.59 275.64 111.82 275.63 112.06C275.53 113.8 275.45 115.54 275.4 117.28L275.4 117.45C275.29 121.01 275.24 124.58 274.96 128.12L275.2 127.93C275.07 132 274.88 136.06 274.56 140.11C274.44 141.74 274.31 143.35 274.14 144.96C273.74 148.8 273.75 154.16 272.42 158.53C272.01 159.31 271.61 160.06 271.2 160.79C270.74 161.62 270.21 162.38 269.62 163.06L270.53 162.54C269.83 163.52 268.98 164.35 267.93 164.97C261.88 168.56 254.31 168.89 249.23 163.37C242.38 155.92 247.26 147.12 249.11 138.68C253.47 118.73 254.46 97.83 252.03 77.54C251.05 69.25 248.17 62.11 253 54.38C257.47 47.19 265.79 44.37 273.89 46.61C291.82 51.58 300.04 73.69 308.62 88.15C311.73 93.39 314.91 98.54 322.04 96.33C327.93 94.51 338.56 81.32 343.81 76.72C352.03 69.53 363.15 71.51 367 81.98C373.01 98.32 374.33 121.33 372.5 138.54",
  "M275.4 117.45C275.36 120.94 275.3 124.44 275.2 127.93L274.96 128.12C275.24 124.58 275.29 121.01 275.4 117.45",
  "M265.72 0.12C280.03 -1.43 290.64 12.77 284.6 26C279.05 38.17 262.59 40.24 254.01 30.05C244.8 19.09 251.54 1.65 265.72 0.12",
  "M363.11 41.77C375.55 53.63 358.53 73.51 344.85 62.25C330.45 50.38 349.55 28.85 363.11 41.77",
] as const;

/** "Me": the accent colour of the wordmark (orange). */
export const WORDMARK_ACCENT_PATHS = [
  ...MARK_PATHS,
  "M462.08 133.64C461.91 133.41 461.73 133.17 461.55 132.94C457.92 128.32 451.22 131.77 447.6 134.83C445.11 136.94 442.85 139.43 440.2 141.28C439.29 141.92 438.33 142.48 437.3 142.92C432.28 145.07 425.99 143.82 422.18 139.91C417.9 135.51 418.02 129.96 419.5 124.47C430.86 125 441 124.15 450.22 116.6C458.24 110.03 463.01 100.12 462.78 89.73C462.49 76.7 452.35 67.72 440.44 64.43C430.65 61.73 420.21 62.63 411.16 67.31C389.87 78.32 380.79 99.91 385.32 122.94C388.65 139.91 394.69 156.15 412.54 161.73C421.32 164.48 431.09 165.34 440.18 163.79C443.23 163.27 446.31 162.6 449.22 161.54C451.28 160.8 452.97 159.47 454.98 158.65C459.71 156.72 463.65 153.77 465.3 148.71C467.1 143.22 465.33 138.05 462.08 133.64M415.55 107.56C415.21 100.94 417.42 87.86 423.54 84.63C429.31 81.57 434.41 87.52 434.75 93.63C434.92 99.92 428.63 107.73 422.01 108.07C420.65 108.07 415.55 107.73 415.55 107.56",
] as const;

export const WORDMARK_VIEWBOX = `0 0 ${WORDMARK_BOX.width} ${WORDMARK_BOX.height}`;
export const MARK_VIEWBOX = `${MARK_BOX.x} ${MARK_BOX.y} ${MARK_BOX.width} ${MARK_BOX.height}`;

/**
 * App icon proportions, measured from the approved cutout: the tile corner is 14.4% of its side
 * and the mark is 75.3% of its height, centred. Full-bleed icons (iOS masks its own corners) use a
 * smaller mark so the dots clear the mask.
 */
export const APP_ICON = {
  cornerRatio: 0.1437,
  markRatio: 0.7533,
  fullBleedMarkRatio: 0.64,
} as const;

type Size = { width: number; height: number };

const svgOpen = (viewBox: string, size?: Size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${size ? ` width="${size.width}" height="${size.height}"` : ""}>`;
const paths = (ds: readonly string[], fill: string) => ds.map((d) => `<path fill="${fill}" d="${d}"/>`).join("");

/** The wordmark as a standalone SVG document. */
export function wordmarkSvg({ base, accent, size }: { base: string; accent: string; size?: Size }) {
  return `${svgOpen(WORDMARK_VIEWBOX, size)}${paths(WORDMARK_BASE_PATHS, base)}${paths(WORDMARK_ACCENT_PATHS, accent)}</svg>`;
}

/** The logomark (the "M" with two dots) as a standalone SVG document. */
export function logomarkSvg({ fill, size }: { fill: string; size?: Size }) {
  return `${svgOpen(MARK_VIEWBOX, size)}${paths(MARK_PATHS, fill)}</svg>`;
}

/** Tile side, corner radius and the transform that centres the mark on it (React and SVG share it). */
export function appIconLayout(fullBleed = false) {
  const r2 = (n: number) => +n.toFixed(2);
  const side = MARK_BOX.height / APP_ICON.markRatio;
  const scale = fullBleed ? APP_ICON.fullBleedMarkRatio / APP_ICON.markRatio : 1;
  const x = (side - MARK_BOX.width * scale) / 2 - MARK_BOX.x * scale;
  const y = (side - MARK_BOX.height * scale) / 2 - MARK_BOX.y * scale;
  return {
    side: r2(side),
    radius: fullBleed ? 0 : r2(side * APP_ICON.cornerRatio),
    transform: `translate(${r2(x)} ${r2(y)}) scale(${+scale.toFixed(4)})`,
  };
}

/**
 * The app icon: the mark centred on a square tile. Rounded by default (favicons, the kit);
 * `fullBleed` draws a plain square with a smaller mark for platforms that mask the corners.
 */
export function appIconSvg({
  tile,
  mark,
  fullBleed = false,
  size,
}: {
  tile: string;
  mark: string;
  fullBleed?: boolean;
  size?: number;
}) {
  const { side, radius, transform } = appIconLayout(fullBleed);
  return (
    `${svgOpen(`0 0 ${side} ${side}`, size ? { width: size, height: size } : undefined)}` +
    `<rect width="${side}" height="${side}" rx="${radius}" fill="${tile}"/>` +
    `<g transform="${transform}">${paths(MARK_PATHS, mark)}</g></svg>`
  );
}
