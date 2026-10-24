import { formatMonthYear, recapLines } from "@/lib/recap";
import { getSession } from "@/server/dal/session";
import { NotFoundError, toHttpResponse } from "@/server/lib/errors";
import { displayUrl } from "@/server/og/share-card";
import { Figure, renderHighlightCard, StatRows } from "@/server/og/highlight-card";
import { services } from "@/server/services";
import { entriesToObject } from "@/server/validation/shoutout";
import { recapCardSchema } from "@/server/validation/engagement";

/** The creator's own monthly recap card (owner-only, never cached). Amounts only with `amounts=1`. */
export async function GET(request: Request): Promise<Response> {
  // Reading the URL first ends build-time prerendering before anything below can catch it.
  const params = new URL(request.url).searchParams;
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
    const parsed = recapCardSchema.safeParse(entriesToObject(params.entries()));
    if (!parsed.success) throw new NotFoundError("No recap for that month.");
    const opts = parsed.data;
    const [recap, profile] = await Promise.all([services.recaps.get(session.actor, opts.month), services.creators.getOwnProfile(session.actor)]);
    if (!recap || !profile) throw new NotFoundError("No recap for that month.");

    const [lead, ...rest] = recapLines(recap.stats, { showAmounts: opts.amounts });
    const rows = rest.slice(0, opts.size === "story" ? 4 : 2);
    return renderHighlightCard({
      size: opts.size,
      creator: { displayName: profile.displayName, handle: profile.handle, avatarUrl: profile.avatarUrl, link: displayUrl(`/${profile.handle}`) },
      tag: formatMonthYear(recap.month),
      badge: recap.stats.bestMonth ? "My best month yet" : null,
      cta: "Thank you all. Support me here",
      children: (t) => (
        <div style={{ display: "flex", flexDirection: "column", gap: opts.size === "story" ? 56 : 24 }}>
          {lead ? <Figure t={t} size={opts.size} value={lead.value} label={lead.label} /> : null}
          <StatRows size={opts.size} rows={rows} />
        </div>
      ),
    });
  } catch (err) {
    return toHttpResponse(err);
  }
}
