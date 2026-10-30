// Build the logo files from the vector source (lib/brand-logo.ts) and the colours in
// styles/tokens.css, so a palette change is one token edit and one re-run.
//
//   npm run brand:build    favicon.ico, icon.svg and apple-icon.png in app/ (committed), and the
//                          downloadable kit in brand/kit/ (git-ignored): SVG + PNGs + one ZIP
//   npm run brand:upload   build, then put the kit in the public R2 bucket under brand/<version>/
//
// The upload uses R2_* from the env (.env.local: local MinIO). Run it with production env to
// publish the kit. It overwrites the same keys, so re-running is safe; for new artwork bump
// BRAND_KIT_VERSION in lib/brand-kit.ts instead, because the files are cached as immutable.
// Runs under the react-server condition so `server-only` modules (R2 client, env) load outside Next.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { zipSync } from "fflate";
import sharp from "sharp";
import {
  BRAND_ASSETS,
  BRAND_KIT_PREFIX,
  BRAND_KIT_ZIP,
  brandAssetFiles,
  brandAssetSvg,
  brandColourValue,
  EMAIL_LOGO,
  type BrandPalette,
} from "@/lib/brand-kit";
import { appIconSvg, WORDMARK_BOX, wordmarkSvg } from "@/lib/brand-logo";
import { getR2Config } from "@/server/env";
import { parseTokens } from "@/server/lib/brand-tokens";
import { R2Storage } from "@/server/integrations/r2/client";

loadEnvConfig(process.cwd());

const ROOT = process.cwd();
const KIT_DIR = path.join(ROOT, "brand/kit");
const FAVICON_SIZES = [16, 32, 48];
const APPLE_ICON_SIZE = 180;

const png = (svg: string) => sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();

/** An .ico holding PNG images (supported by every current browser), smallest first. */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

async function buildAppIcons(palette: BrandPalette) {
  const white = "#ffffff";
  await writeFile(path.join(ROOT, "app/icon.svg"), appIconSvg({ tile: palette.primary, mark: white }) + "\n");
  const favicons = await Promise.all(
    FAVICON_SIZES.map(async (size) => ({
      size,
      data: await png(appIconSvg({ tile: palette.primary, mark: white, size })),
    })),
  );
  await writeFile(path.join(ROOT, "app/favicon.ico"), ico(favicons));
  // iOS masks the corners itself and shows transparency as black, so this one is full-bleed.
  const apple = appIconSvg({
    tile: palette.primary,
    mark: white,
    fullBleed: true,
    size: APPLE_ICON_SIZE,
  });
  await writeFile(path.join(ROOT, "app/apple-icon.png"), await png(apple));
  console.log("app/: favicon.ico, icon.svg, apple-icon.png");
}

async function buildKit(palette: BrandPalette): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for (const asset of BRAND_ASSETS) {
    for (const file of brandAssetFiles(asset)) {
      // The SVG gets a nominal 1024px size so apps that ignore viewBox don't open it tiny.
      const svg = brandAssetSvg(asset, palette, file.size ?? 1024);
      files.set(file.name, file.format === "SVG" ? Buffer.from(svg + "\n") : await png(svg));
    }
  }
  // PNGs are already compressed; only the SVGs gain from deflate.
  const zip = zipSync(
    Object.fromEntries(
      [...files].map(([name, data]) => [`DuMeGud brand kit/${name}`, [data, { level: name.endsWith(".svg") ? 9 : 0 }]]),
    ),
  );
  files.set(BRAND_KIT_ZIP, Buffer.from(zip));

  // Email header logos go next to the kit but not in the ZIP.
  for (const variant of [EMAIL_LOGO.light, EMAIL_LOGO.dark]) {
    const width = EMAIL_LOGO.width * EMAIL_LOGO.scale;
    const size = { width, height: Math.round((width * WORDMARK_BOX.height) / WORDMARK_BOX.width) };
    const svg = wordmarkSvg({ base: brandColourValue(variant.base, palette), accent: brandColourValue(variant.accent, palette), size });
    files.set(variant.file, await png(svg));
  }

  await rm(KIT_DIR, { recursive: true, force: true });
  await mkdir(KIT_DIR, { recursive: true });
  await Promise.all([...files].map(([name, data]) => writeFile(path.join(KIT_DIR, name), data)));
  console.log(`brand/kit/: ${files.size} files`);
  return files;
}

const EMAIL_FILES = new Set<string>([EMAIL_LOGO.light.file, EMAIL_LOGO.dark.file]);

const CONTENT_TYPES: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  zip: "application/zip",
};

async function upload(files: Map<string, Buffer>) {
  const r2 = getR2Config();
  if (!r2) throw new Error("R2 isn't configured: set R2_ENDPOINT or R2_ACCOUNT_ID, the keys and R2_PUBLIC_BASE_URL.");
  const storage = new R2Storage(r2);
  for (const [name, body] of files) {
    await storage.putObject({
      bucket: r2.publicBucket,
      key: `${BRAND_KIT_PREFIX}/${name}`,
      body,
      contentType: CONTENT_TYPES[name.split(".").pop()!],
      cacheControl: "public, max-age=31536000, immutable",
      // Kit files download; the email logos must display inline.
      contentDisposition: EMAIL_FILES.has(name) ? undefined : `attachment; filename="${name}"`,
    });
  }
  console.log(`Uploaded ${files.size} files to ${r2.publicBaseUrl}/${BRAND_KIT_PREFIX}/`);
}

async function main() {
  const tokens = parseTokens(await readFile(path.join(ROOT, "styles/tokens.css"), "utf8"));
  if (!tokens.primary || !tokens.secondary) throw new Error("styles/tokens.css is missing --dmg-primary or --dmg-secondary");
  const palette: BrandPalette = {
    primary: tokens.primary,
    secondary: tokens.secondary,
  };
  await buildAppIcons(palette);
  const files = await buildKit(palette);
  if (process.argv.includes("--upload")) await upload(files);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
