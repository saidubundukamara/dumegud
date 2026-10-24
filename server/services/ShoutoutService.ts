import "server-only";
import {
  buildCaption,
  isShoutoutPlatform,
  mentionFor,
  type CaptionStyle,
  type ShoutoutPeriod,
  type ShoutoutPerson,
  type ShoutoutPlatform,
} from "@/lib/shoutout";
import { TRAFFIC_SOURCES, type TrafficSource } from "@/lib/traffic-source";
import { NotFoundError } from "@/server/lib/errors";
import type { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import type { ShoutoutCandidate, ShoutoutRepository } from "@/server/repositories/ShoutoutRepository";
import type { Actor } from "./actor";
import type { AuditLogger } from "./compliance";
import { runInTransaction } from "./transaction";

const DAY_MS = 86_400_000;
const PERIOD_DAYS: Record<ShoutoutPeriod, number> = { week: 7, month: 30, since_last: 90 };
export const TOP_SUPPORTERS = 3;

export type ShoutoutOptions = {
  period: ShoutoutPeriod;
  platform: ShoutoutPlatform;
  style: CaptionStyle;
  includeTop: boolean;
  /** Contributions the creator chose to leave out of this post. */
  exclude: readonly string[];
};

export type ShoutoutPersonDTO = ShoutoutPerson & {
  contributionId: string;
  mention: string;
  excluded: boolean;
  thanked: boolean;
};

export type ShoutoutPreviewDTO = {
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  pageUrl: string;
  people: ShoutoutPersonDTO[];
  /** Ranked by total given in the period (grouped by mobile-money payer). Never carries amounts. */
  top: ShoutoutPerson[];
  caption: string;
};

export type ShoutoutServiceDeps = {
  repos: { shoutouts: ShoutoutRepository; profiles: CreatorProfileRepository };
  audit?: AuditLogger;
  appBaseUrl: string;
  publicAssetUrl?: (key: string) => string | null;
  now?: () => Date;
  transaction?: typeof runInTransaction;
};

const toPerson = (c: ShoutoutCandidate): ShoutoutPerson => ({
  name: c.supporterName,
  platform: isShoutoutPlatform(c.socialPlatform) ? c.socialPlatform : null,
  handle: isShoutoutPlatform(c.socialPlatform) ? c.socialHandle : null,
});

/**
 * Top supporters by total given in the period. Grouped by the mobile-money payer (not by the
 * self-declared handle, which anyone could type), labelled with their latest named contribution.
 */
export function rankTopSupporters(candidates: readonly ShoutoutCandidate[], platform: ShoutoutPlatform, limit = TOP_SUPPORTERS): ShoutoutPerson[] {
  const groups = new Map<string, { total: number; latest: ShoutoutCandidate; first: number }>();
  candidates.forEach((c, i) => {
    if (!mentionFor(toPerson(c), platform)) return;
    const key = c.payerFingerprintHash ?? `contribution:${c.contributionId}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { total: c.grossMinor, latest: c, first: i });
    else {
      g.total += c.grossMinor;
      g.latest = c; // candidates are oldest first
    }
  });
  if (groups.size < 2) return []; // a "top 1" ranking says nothing kind
  return [...groups.values()]
    .sort((a, b) => b.total - a.total || a.first - b.first)
    .slice(0, limit)
    .map((g) => toPerson(g.latest));
}

/** Thank-you posts: who to thank, the caption, and which supporters are still waiting. */
export class ShoutoutService {
  private readonly now: () => Date;
  private readonly transaction: typeof runInTransaction;

  constructor(private readonly deps: ShoutoutServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.transaction = deps.transaction ?? runInTransaction;
  }

  async preview(actor: Actor, opts: ShoutoutOptions): Promise<ShoutoutPreviewDTO> {
    const profile = await this.deps.repos.profiles.findByUserId(actor.userId);
    if (!profile) throw new NotFoundError("Set up your page first.");
    const candidates = await this.candidates(actor.userId, opts.period);
    const excluded = new Set(opts.exclude);

    const people: ShoutoutPersonDTO[] = [];
    for (const c of candidates) {
      const person = toPerson(c);
      const mention = mentionFor(person, opts.platform);
      if (!mention) continue;
      people.push({ ...person, contributionId: c.contributionId, mention, excluded: excluded.has(c.contributionId), thanked: c.thankedAt !== null });
    }
    const included = candidates.filter((c) => !excluded.has(c.contributionId));
    const top = opts.includeTop ? rankTopSupporters(included, opts.platform) : [];
    const pageUrl = `${new URL(this.deps.appBaseUrl).host}/${profile.handle}`;

    return {
      displayName: profile.displayName,
      handle: profile.handle,
      avatarUrl: profile.avatarKey ? (this.deps.publicAssetUrl?.(profile.avatarKey) ?? null) : null,
      pageUrl,
      people,
      top,
      caption: buildCaption({
        style: opts.style,
        platform: opts.platform,
        period: opts.period,
        people: people.filter((p) => !p.excluded),
        top,
        pageUrl,
      }),
    };
  }

  /**
   * The creator posted it: everyone they reviewed (named or left out) stops waiting, and the
   * post is recorded. Only ids still eligible for this creator and period are touched.
   */
  async markPosted(actor: Actor, opts: ShoutoutOptions & { reviewed: readonly string[] }): Promise<{ thanked: number }> {
    const candidates = await this.candidates(actor.userId, opts.period);
    const reviewed = new Set(opts.reviewed);
    const excluded = new Set(opts.exclude);
    const ids = candidates.map((c) => c.contributionId).filter((id) => reviewed.has(id));
    const named = ids.filter((id) => !excluded.has(id));
    if (!ids.length) return { thanked: 0 };

    const at = this.now();
    const { thanked, shoutoutId } = await this.transaction(async (tx) => {
      const thanked = await this.deps.repos.shoutouts.markThanked(actor.userId, ids, at, tx);
      // A double submit: the first one already thanked everyone, so there is no new post to record.
      if (thanked === 0) return { thanked, shoutoutId: null };
      const row = await this.deps.repos.shoutouts.insert(
        { creatorId: actor.userId, period: opts.period, platform: opts.platform, includeTop: opts.includeTop, contributionIds: named },
        tx,
      );
      return { thanked, shoutoutId: row.id };
    });
    if (!shoutoutId) return { thanked };
    await this.deps.audit?.log({
      actor,
      action: "shoutout.posted",
      targetType: "shoutout",
      targetId: shoutoutId,
      after: { period: opts.period, platform: opts.platform, named: named.length, leftOut: ids.length - named.length },
    });
    return { thanked };
  }

  /** "N supporters waiting for a thank-you" (dashboard nudge). */
  async waitingCount(actor: Actor): Promise<number> {
    return this.deps.repos.shoutouts.countUnthanked(actor.userId, this.since("since_last"));
  }

  /** Succeeded payments and gross per traffic source, most valuable first. */
  async sourceTotals(actor: Actor): Promise<Array<{ source: TrafficSource | null; payments: number; grossMinor: number }>> {
    const rows = await this.deps.repos.shoutouts.sourceTotals(actor.userId);
    return rows
      .map((r) => ({ ...r, source: r.source && (TRAFFIC_SOURCES as readonly string[]).includes(r.source) ? r.source : null }))
      .sort((a, b) => b.grossMinor - a.grossMinor);
  }

  private candidates(creatorId: string, period: ShoutoutPeriod) {
    return this.deps.repos.shoutouts.listCandidates(creatorId, { since: this.since(period), onlyUnthanked: period === "since_last" });
  }

  private since(period: ShoutoutPeriod): Date {
    return new Date(this.now().getTime() - PERIOD_DAYS[period] * DAY_MS);
  }
}
