import { isMoneyMilestone, MILESTONES, type MilestoneKey } from "@/lib/milestones";
import { formatDate } from "@/lib/dates";
import { getSession } from "@/server/dal/session";
import { NotFoundError, toHttpResponse } from "@/server/lib/errors";
import { displayUrl } from "@/server/og/share-card";
import { Figure, renderHighlightCard } from "@/server/og/highlight-card";
import { services } from "@/server/services";
import { entriesToObject } from "@/server/validation/shoutout";
import { milestoneCardSchema } from "@/server/validation/engagement";

/**
 * A reached milestone's card (owner-only, never cached). Money milestones only show the amount
 * with `amounts=1`; otherwise the card celebrates without the figure.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
    const parsed = milestoneCardSchema.safeParse(entriesToObject(params.entries()));
    if (!parsed.success) throw new NotFoundError("That milestone card doesn't exist.");
    const opts = parsed.data;
    const key = opts.key as MilestoneKey;
    const [reached, profile] = await Promise.all([services.milestones.getReached(session.actor, key), services.creators.getOwnProfile(session.actor)]);
    if (!reached || !profile) throw new NotFoundError("You haven't reached that milestone yet.");

    const m = MILESTONES[key];
    const hidden = isMoneyMilestone(key) && !opts.amounts;
    const story = opts.size === "story";
    return renderHighlightCard({
      size: opts.size,
      creator: { displayName: profile.displayName, handle: profile.handle, avatarUrl: profile.avatarUrl, link: displayUrl(`/${profile.handle}`) },
      tag: "Milestone",
      cta: "Thank you for getting me here",
      children: (t) => (
        <div style={{ display: "flex", flexDirection: "column", gap: story ? 36 : 20 }}>
          {hidden ? <Figure t={t} size={opts.size} value="Big news" label="a new milestone, thanks to my fans" solo /> : <Figure t={t} size={opts.size} value={m.figure} label={m.line} solo />}
          <div style={{ display: "flex", fontSize: story ? 36 : 30, opacity: 0.75 }}>Reached {formatDate(reached.achievedAt)}</div>
        </div>
      ),
    });
  } catch (err) {
    return toHttpResponse(err);
  }
}
