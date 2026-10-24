import "server-only";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { brandTokens, type BrandTokens } from "@/server/lib/brand-tokens";
import { loadFonts, loadPhoto } from "./share-card";

// Share cards for a creator's own highlights (monthly recap, milestones), sized for WhatsApp
// Status / Stories / TikTok (story) and feeds or chats (square). Same language as the link
// previews: maroon with the orange glow, Geist, the wordmark. No emoji: Satori would fetch them
// from a CDN at render time. Owner-only and never cached (see the headers below).

export const CARD_SIZES = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
} as const;

export type CardSize = keyof typeof CARD_SIZES;

export type CardCreator = { displayName: string; handle: string; avatarUrl: string | null; link: string };

type FrameProps = {
  size: CardSize;
  creator: CardCreator;
  /** The small pill over the headline ("September 2026", "Milestone"). */
  tag: string;
  /** An orange pill next to the tag ("My best month yet"). */
  badge?: string | null;
  cta: string;
  children: (t: BrandTokens) => ReactNode;
};

/** The frame every highlight card shares; `children` fills the middle. */
export async function renderHighlightCard({ size, creator, tag, badge, cta, children }: FrameProps): Promise<ImageResponse> {
  const story = size === "story";
  const avatarPx = story ? 128 : 96;
  const [t, { regular, bold }, photo] = await Promise.all([brandTokens(), loadFonts(), loadPhoto(creator.avatarUrl, avatarPx * 2)]);
  const { width, height } = CARD_SIZES[size];

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: story ? "120px 88px 112px" : "72px 80px",
        backgroundColor: t.primary,
        // The glow sits behind the headline: lit from the top right, dark where the footer is.
        backgroundImage: `radial-gradient(circle at 100% 0%, ${t.secondary} 0%, ${t.primary} ${story ? 48 : 62}%)`,
        color: t["primary-foreground"],
        fontFamily: "Geist",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: story ? 32 : 24 }}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image
            <img
              src={photo}
              alt=""
              width={avatarPx}
              height={avatarPx}
              style={{ borderRadius: avatarPx / 2, border: "4px solid rgba(255,255,255,0.35)", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: avatarPx,
                height: avatarPx,
                borderRadius: avatarPx / 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: t.secondary,
                color: t["secondary-foreground"],
                fontSize: avatarPx * 0.45,
                fontWeight: 700,
              }}
            >
              {creator.displayName.trim().slice(0, 1).toUpperCase()}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", fontSize: story ? 48 : 40, fontWeight: 700, letterSpacing: -1 }}>{creator.displayName}</div>
            <div style={{ display: "flex", fontSize: story ? 34 : 28, opacity: 0.75 }}>@{creator.handle}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: story ? 48 : 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              padding: story ? "12px 28px" : "10px 24px",
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.14)",
              border: "2px solid rgba(255,255,255,0.18)",
              fontSize: story ? 30 : 26,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: "uppercase",
            }}
          >
            {tag}
          </div>
          {badge ? (
            <div
              style={{
                display: "flex",
                padding: story ? "14px 28px" : "10px 24px",
                borderRadius: 999,
                backgroundColor: t.secondary,
                color: t["secondary-foreground"],
                fontSize: story ? 30 : 26,
                fontWeight: 700,
              }}
            >
              {badge}
            </div>
          ) : null}
        </div>
        {children(t)}
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: story ? 16 : 10 }}>
          <div style={{ display: "flex", fontSize: story ? 34 : 28, opacity: 0.8 }}>{cta}</div>
          <div style={{ display: "flex", fontSize: story ? 52 : 40, fontWeight: 700, letterSpacing: -1, color: t.secondary }}>{creator.link}</div>
        </div>
        {/* The wordmark sits in the dark corner: the G's orange would vanish in the glow. */}
        <div style={{ display: "flex", fontSize: story ? 36 : 30, fontWeight: 700, letterSpacing: -1, paddingBottom: 6 }}>
          DuMe<span style={{ color: t.secondary }}>G</span>ud
        </div>
      </div>
    </div>,
    {
      width,
      height,
      // Never cached: the URL doesn't name the creator, so on a shared phone a cached card could
      // show the next account someone else's numbers. The share studio keeps cards in memory.
      headers: { "Cache-Control": "private, no-store" },
      fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}

/** One big figure with its words under it ("34" / "people supported me"). */
export function Figure({ t, size, value, label, solo = false }: { t: BrandTokens; size: CardSize; value: string; label: string; solo?: boolean }) {
  const story = size === "story";
  // A milestone has one number and nothing under it, so it can take the whole card.
  const scale = solo && value.length <= 4 ? 1.4 : 1;
  const big = Math.round((value.length > 6 ? (story ? 160 : 110) : value.length > 3 ? (story ? 300 : 170) : story ? 380 : 200) * scale);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: story ? 8 : 4 }}>
      <div style={{ display: "flex", fontSize: big, fontWeight: 700, lineHeight: 1, letterSpacing: Math.round(-big / 32), color: t.secondary, whiteSpace: "nowrap" }}>
        {value}
      </div>
      <div style={{ display: "flex", fontSize: Math.round((story ? 68 : 46) * (solo ? 1.15 : 1)), fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.1 }}>{label}</div>
    </div>
  );
}

/** Smaller value + label rows under the big figure, split by hairlines. */
export function StatRows({ size, rows }: { size: CardSize; rows: { value: string; label: string }[] }) {
  const story = size === "story";
  if (!rows.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map((r, i) => (
        <div
          key={r.label}
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: story ? 24 : 20,
            padding: story ? "32px 0" : "18px 0",
            borderTop: i ? "2px solid rgba(255,255,255,0.16)" : "none",
          }}
        >
          <div style={{ display: "flex", fontSize: story ? 80 : 52, fontWeight: 700, letterSpacing: -2 }}>{r.value}</div>
          <div style={{ display: "flex", fontSize: story ? 42 : 32, opacity: 0.85 }}>{r.label}</div>
        </div>
      ))}
    </div>
  );
}
