import { ImageResponse } from "next/og";
import { getSession } from "@/server/dal/session";
import { brandTokens } from "@/server/lib/brand-tokens";
import { toHttpResponse } from "@/server/lib/errors";
import { services } from "@/server/services";
import { entriesToObject, shoutoutOptionsSchema } from "@/server/validation/shoutout";

const SIZES = {
  story: { width: 1080, height: 1920 },
  post: { width: 1080, height: 1350 },
} as const;
const MAX_NAMES = { story: 24, post: 16 } as const;

/**
 * The thank-you card for the creator's own shout-out (owner-only, never cached). Same options as
 * the dashboard page. Plain text only: no emoji (they'd be fetched from a CDN at render time).
 */
export async function GET(request: Request): Promise<Response> {
  // Reading the URL first ends build-time prerendering before anything below can catch it.
  const params = new URL(request.url).searchParams;
  let loaded: Awaited<ReturnType<typeof load>>;
  try {
    loaded = await load(params);
  } catch (err) {
    return toHttpResponse(err);
  }
  if (loaded instanceof Response) return loaded;
  const { opts, size, preview, t } = loaded;

  const names = preview.people.filter((p) => !p.excluded).map((p) => p.mention);
  const shown = names.slice(0, MAX_NAMES[size]);
  const more = names.length - shown.length;
  const top = preview.top.map((p) => (p.handle && p.platform === opts.platform ? `@${p.handle}` : (p.name ?? `@${p.handle}`)));
  const { width, height } = SIZES[size];

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: size === "story" ? "160px 80px" : "80px",
        background: t.surface,
        color: t.text,
        fontSize: 40,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        <div
          style={{
            width: 128,
            height: 128,
            borderRadius: 64,
            background: t.primary,
            color: t["primary-foreground"],
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 64,
            fontWeight: 700,
          }}
        >
          {preview.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 48, fontWeight: 700 }}>{preview.displayName}</div>
          <div style={{ color: t.muted }}>@{preview.handle}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <div style={{ fontSize: 120, fontWeight: 700, lineHeight: 1 }}>Thank you!</div>
        {top.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                color: t.muted,
                fontSize: 32,
                textTransform: "uppercase",
                letterSpacing: 4,
              }}
            >
              Top supporters
            </div>
            {top.map((name, i) => (
              <div
                key={name}
                style={{
                  display: "flex",
                  gap: 24,
                  fontSize: 52,
                  fontWeight: 700,
                }}
              >
                <span style={{ color: t.primary }}>{i + 1}</span>
                <span>{name}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {shown.map((name) => (
            <div
              key={name}
              style={{
                display: "flex",
                padding: "8px 24px",
                borderRadius: 999,
                background: t.background,
                border: `2px solid ${t.border}`,
              }}
            >
              {name}
            </div>
          ))}
          {more > 0 ? <div style={{ display: "flex", padding: "8px 24px", color: t.muted }}>+{more} more</div> : null}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ color: t.muted }}>Want a shout-out next time?</div>
        <div style={{ fontSize: 52, fontWeight: 700 }}>{preview.pageUrl}</div>
      </div>
    </div>,
    { width, height, headers: { "Cache-Control": "private, no-store" } },
  );
}

async function load(params: URLSearchParams) {
  const session = await getSession();
  if (!session) return Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  const opts = shoutoutOptionsSchema.parse(entriesToObject(params.entries()));
  const size: keyof typeof SIZES = params.get("size") === "story" ? "story" : "post";
  const [preview, t] = await Promise.all([services.shoutouts.preview(session.actor, opts), brandTokens()]);
  return { opts, size, preview, t };
}
