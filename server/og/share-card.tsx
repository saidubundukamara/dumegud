import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import sharp from "sharp";
import { brandTokens, type BrandTokens } from "@/server/lib/brand-tokens";
import { logger } from "@/server/lib/logger";
import { siteUrl } from "@/server/lib/site";

// Link-preview cards (Open Graph / X) drawn with next/og. Satori reads neither CSS variables nor
// WebP, so colours come from styles/tokens.css via brandTokens() and photos are re-encoded to PNG.
// Every file read here is traced into the image routes (next.config.ts outputFileTracingIncludes).

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const FONT_DIR = path.join(process.cwd(), "node_modules/@fontsource/geist-sans/files");
let fonts: Promise<{ regular: Buffer; bold: Buffer }> | undefined;

function loadFonts() {
  fonts ??= Promise.all([
    readFile(path.join(FONT_DIR, "geist-sans-latin-400-normal.woff")),
    readFile(path.join(FONT_DIR, "geist-sans-latin-700-normal.woff")),
  ]).then(([regular, bold]) => ({ regular, bold }));
  return fonts;
}

/**
 * A remote photo (avatar, product preview) as a PNG data URI, cropped to `width`×`height`.
 * Null when it can't be fetched or read quickly, so the card falls back instead of failing.
 */
export async function loadPhoto(url: string | null | undefined, width: number, height = width): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const png = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(width, height, { fit: "cover" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch (error) {
    logger.warn("og photo unavailable", { error: String(error) });
    return null;
  }
}

/** "dumegud.com/kotor_saedu", the link as people will type it. */
export function displayUrl(pathname = ""): string {
  return `${siteUrl().host}${pathname}`;
}

/** Cuts to whole words so a card never ends mid-word. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[.,;:!?-]+$/, "")}…`;
}

/**
 * The shared frame: brand maroon with the orange glow, the wordmark top left, and a footer with an
 * orange call to action and the link. `children` fills the middle.
 */
export async function renderShareCard({ cta, link, children }: { cta: string; link: string; children: (t: BrandTokens) => ReactNode }) {
  const [t, { regular, bold }] = await Promise.all([brandTokens(), loadFonts()]);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "56px 72px",
        backgroundColor: t.primary,
        backgroundImage: `radial-gradient(circle at 100% 0%, ${t.secondary} 0%, ${t.primary} 55%)`,
        color: t["primary-foreground"],
        fontFamily: "Geist",
      }}
    >
      {/* The site wordmark: the G picks out the accent, orange here because the card is maroon. */}
      <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>
        DuMe<span style={{ color: t.secondary }}>G</span>ud
      </div>
      {children(t)}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32 }}>
        <div
          style={{
            display: "flex",
            padding: "16px 32px",
            borderRadius: 999,
            backgroundColor: t.secondary,
            color: t["secondary-foreground"],
            fontSize: 32,
            fontWeight: 700,
          }}
        >
          {cta}
        </div>
        <div style={{ display: "flex", fontSize: 30, opacity: 0.85 }}>{link}</div>
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
