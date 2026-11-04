import { getSession } from "@/server/dal/session";
import { toHttpResponse } from "@/server/lib/errors";
import { displayUrl } from "@/server/og/share-card";
import { renderHighlightCard } from "@/server/og/highlight-card";
import { services } from "@/server/services";
import { entriesToObject, shoutoutOptionsSchema } from "@/server/validation/shoutout";

const MAX_NAMES = { story: 24, post: 14 } as const;
const PERIOD_LINE = { week: "for supporting me this week", month: "for supporting me this month", since_last: "for supporting me" } as const;

/**
 * The thank-you card for the creator's own shout-out (owner-only, never cached). Same options as
 * the dashboard page, and the same frame as the recap and milestone cards. Plain text only: no
 * emoji (they'd be fetched from a CDN at render time).
 */
export async function GET(request: Request): Promise<Response> {
  // Reading the URL first ends build-time prerendering before anything below can catch it.
  const params = new URL(request.url).searchParams;
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
    const opts = shoutoutOptionsSchema.parse(entriesToObject(params.entries()));
    const size = params.get("size") === "story" ? "story" : "post";
    const story = size === "story";
    const preview = await services.shoutouts.preview(session.actor, opts);

    const names = preview.people.filter((p) => !p.excluded).map((p) => p.mention);
    const top = preview.top.map((p) => (p.handle && p.platform === opts.platform ? `@${p.handle}` : (p.name ?? `@${p.handle}`)));
    // Names already in the top list aren't repeated as pills.
    const rest = names.filter((n) => !top.includes(n));
    const shown = rest.slice(0, MAX_NAMES[size] - top.length * 2);
    const more = rest.length - shown.length;
    // Few names get big pills; a long list gets smaller ones so it still fits.
    const pill = shown.length <= 4 ? (story ? 52 : 42) : shown.length <= 10 ? (story ? 42 : 34) : story ? 34 : 28;
    const pillPad = `${Math.round(pill * 0.3)}px ${Math.round(pill * 0.6)}px`;

    return await renderHighlightCard({
      size,
      creator: { displayName: preview.displayName, handle: preview.handle, avatarUrl: preview.avatarUrl, link: displayUrl(`/${preview.handle}`) },
      tag: "Shout-out",
      badge: names.length ? `${names.length} ${names.length === 1 ? "supporter" : "supporters"}` : null,
      cta: "Want a shout-out next time? Support me at",
      children: (t) => (
        <div style={{ display: "flex", flexDirection: "column", gap: story ? 56 : 36 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: story ? 12 : 6 }}>
            <div style={{ display: "flex", fontSize: story ? 168 : 140, fontWeight: 700, lineHeight: 0.95, letterSpacing: story ? -7 : -6, whiteSpace: "nowrap" }}>
              Thank you
            </div>
            <div style={{ display: "flex", fontSize: story ? 58 : 44, fontWeight: 700, letterSpacing: -1.5, color: t.secondary }}>
              {PERIOD_LINE[opts.period]}
            </div>
          </div>

          {top.length ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: story ? 20 : 14,
                padding: story ? "36px 40px" : "24px 32px",
                borderRadius: story ? 40 : 32,
                backgroundColor: "rgba(255,255,255,0.10)",
                border: "2px solid rgba(255,255,255,0.16)",
              }}
            >
              <div style={{ display: "flex", fontSize: story ? 28 : 22, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", opacity: 0.75 }}>
                Top supporters
              </div>
              {top.map((name, i) => (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: story ? 24 : 18 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: story ? 64 : 50,
                      height: story ? 64 : 50,
                      borderRadius: 999,
                      backgroundColor: t.secondary,
                      color: t["secondary-foreground"],
                      fontSize: story ? 34 : 26,
                      fontWeight: 700,
                    }}
                  >
                    {String(i + 1)}
                  </div>
                  <div style={{ display: "flex", fontSize: story ? 52 : 40, fontWeight: 700, letterSpacing: -1 }}>{name}</div>
                </div>
              ))}
            </div>
          ) : null}

          {shown.length || more > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: story ? 16 : 12 }}>
              {shown.map((name) => (
                <div
                  key={name}
                  style={{
                    display: "flex",
                    padding: pillPad,
                    borderRadius: 999,
                    backgroundColor: "rgba(255,255,255,0.14)",
                    border: "2px solid rgba(255,255,255,0.22)",
                    fontSize: pill,
                    fontWeight: 700,
                  }}
                >
                  {name}
                </div>
              ))}
              {more > 0 ? (
                <div
                  style={{
                    display: "flex",
                    padding: pillPad,
                    borderRadius: 999,
                    backgroundColor: t.secondary,
                    color: t["secondary-foreground"],
                    fontSize: pill,
                    fontWeight: 700,
                  }}
                >
                  {`+${more} more`}
                </div>
              ) : null}
            </div>
          ) : top.length ? null : (
            <div style={{ display: "flex", fontSize: story ? 44 : 34, opacity: 0.85 }}>to everyone who sent me a gift</div>
          )}
        </div>
      ),
    });
  } catch (err) {
    return toHttpResponse(err);
  }
}
