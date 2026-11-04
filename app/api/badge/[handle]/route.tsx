import { ImageResponse } from "next/og";
import { z } from "zod";
import { logomarkSvg } from "@/lib/brand-logo";
import { handleFormatError, normalizeHandle } from "@/lib/handle";
import { brandTokens, type BrandTokens } from "@/server/lib/brand-tokens";
import { toHttpResponse } from "@/server/lib/errors";
import { BADGE_LABEL, BADGE_SIZES, badgeLayout, renderBadgeSvg, type BadgeSize } from "@/lib/badge";
import { loadFonts } from "@/server/og/share-card";
import { getCachedPublicProfile } from "@/server/queries/public-profile";

// The embeddable "Support me on DuMeGud" badge: /api/badge/{handle} (SVG), ?size=sm|lg,
// ?format=png (or a .svg/.png suffix on the handle, for tools that want an extension). Public and
// CDN-cached; the profile lookup is the same cached read the creator page uses.

const querySchema = z.object({
  size: z.enum(BADGE_SIZES).catch("sm"),
  format: z.enum(["svg", "png"]).catch("svg"),
});

const CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
const PNG_SCALE = 2;

export async function GET(request: Request, { params }: RouteContext<"/api/badge/[handle]">): Promise<Response> {
  // Reading the URL first ends build-time prerendering before anything below can catch it.
  const search = new URL(request.url).searchParams;
  try {
    const query = querySchema.parse({ size: search.get("size") ?? undefined, format: search.get("format") ?? undefined });
    let raw = (await params).handle;
    let format = query.format;
    const ext = /\.(svg|png)$/i.exec(raw);
    if (ext) {
      format = ext[1].toLowerCase() as "svg" | "png";
      raw = raw.slice(0, -ext[0].length);
    }

    const handle = normalizeHandle(decodeURIComponent(raw));
    if (handleFormatError(handle)) return notFound();
    const result = await getCachedPublicProfile(handle);
    const shown = result.kind === "found" ? result.profile.handle : result.kind === "redirect" ? result.handle : null;
    if (!shown) return notFound();

    const tokens = await brandTokens();
    if (format === "svg") {
      return new Response(renderBadgeSvg({ handle: shown, size: query.size, tokens }), {
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": CACHE,
        },
      });
    }
    return renderPng(shown, query.size, tokens);
  } catch (err) {
    return toHttpResponse(err);
  }
}

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}

async function renderPng(handle: string, size: BadgeSize, t: BrandTokens): Promise<Response> {
  const l = badgeLayout(handle, size);
  const s = PNG_SCALE;
  const { regular } = await loadFonts();
  const mark = logomarkSvg({ fill: t["primary-foreground"] });
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        borderRadius: l.radius * s,
        overflow: "hidden",
        fontFamily: "Geist",
        fontSize: l.fontSize * s,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: l.gap * s,
          width: l.left * s,
          background: t.primary,
          color: t["primary-foreground"],
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img>, not next/image. */}
        <img alt="" src={`data:image/svg+xml,${encodeURIComponent(mark)}`} width={l.markWidth * s} height={l.mark * s} />
        <span>{BADGE_LABEL}</span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: l.right * s,
          background: t.secondary,
          color: t["secondary-foreground"],
        }}
      >
        {`@${handle}`}
      </div>
    </div>,
    {
      width: l.width * s,
      height: l.height * s,
      fonts: [{ name: "Geist", data: regular, weight: 400, style: "normal" }],
      headers: { "Cache-Control": CACHE },
    },
  );
}
