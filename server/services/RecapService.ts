import "server-only";
import { formatMonth, isMonthKey, monthKey, monthRange, previousMonth, type MonthKey, type RecapStats } from "@/lib/recap";
import { formatSLECompact } from "@/lib/money";
import type { CreatorRecap } from "@/server/db/schema";
import type { EmailService } from "@/server/integrations/email";
import { monthlyRecapTemplate } from "@/server/integrations/email/templates";
import { logger } from "@/server/lib/logger";
import type { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import type { EngagementRepository } from "@/server/repositories/EngagementRepository";
import type { Actor } from "./actor";
import type { JobContext, JobResult } from "./JobService";

/** Home shows last month's recap (or the quiet-month nudge) for the first days of a month. */
export const RECAP_HOME_DAYS = 10;
/**
 * A month is frozen only this long after it ends, so a settlement whose transaction stamped
 * settledAt just before midnight but committed just after is always counted. (A payment released
 * from review later keeps its original settledAt; the recap stays as it was built.)
 */
export const RECAP_GRACE_MS = 60 * 60_000;
const BATCH = 50;
const HISTORY = 24;

export type RecapDTO = { id: string; month: MonthKey; stats: RecapStats; seen: boolean };

export type RecapHomeDTO = { kind: "recap"; recap: RecapDTO } | { kind: "quiet"; month: MonthKey } | null;

export type RecapServiceDeps = {
  repos: { engagement: EngagementRepository; profiles: CreatorProfileRepository };
  email: EmailService;
  appBaseUrl: string;
  now?: () => Date;
};

const toDTO = (r: CreatorRecap): RecapDTO => ({ id: r.id, month: r.month, stats: r.stats, seen: r.seenAt !== null });

/**
 * Monthly recaps. A recap is built once, after its month has ended, and stored: building is an
 * INSERT … ON CONFLICT DO NOTHING on (creator, month), so the job and a dashboard visit building
 * the same month at the same moment end up with the same single row. Emails are claimed
 * atomically before sending and released if sending fails.
 */
export class RecapService {
  private readonly now: () => Date;

  constructor(private readonly deps: RecapServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** The stored recap, building it first if the month is over. Null for a month with no activity. */
  async build(creatorId: string, month: MonthKey): Promise<CreatorRecap | null> {
    const repo = this.deps.repos.engagement;
    const existing = await repo.findRecap(creatorId, month);
    if (existing) return existing;
    const { from, to } = monthRange(month);
    if (to.getTime() + RECAP_GRACE_MS > this.now().getTime()) return null; // never freeze a month too early
    const agg = await repo.monthAggregate(creatorId, from, to);
    if (!agg.gifts && !agg.productsSold) return null;
    const best = await repo.bestMonthBefore(creatorId, from);
    return repo.insertRecap(creatorId, { month, ...agg, bestMonth: best !== null && agg.receivedNetMinor > best });
  }

  /** Newest first. Builds last month's first if it's due (the job may not have run yet). */
  async list(actor: Actor): Promise<RecapDTO[]> {
    await this.build(actor.userId, previousMonth(monthKey(this.now())));
    return (await this.deps.repos.engagement.listRecaps(actor.userId, HISTORY)).map(toDTO);
  }

  /** Owner-scoped. */
  async get(actor: Actor, month: string): Promise<RecapDTO | null> {
    if (!isMonthKey(month)) return null;
    const row = await this.build(actor.userId, month);
    return row ? toDTO(row) : null;
  }

  /** What Home shows early in the month: an unseen recap, a nudge after a quiet month, or nothing. */
  async home(actor: Actor): Promise<RecapHomeDTO> {
    const now = this.now();
    if (now.getUTCDate() > RECAP_HOME_DAYS) return null;
    const month = previousMonth(monthKey(now));
    const profile = await this.deps.repos.profiles.findByUserId(actor.userId);
    // Only creators whose page was live before that month ended.
    const { to } = monthRange(month);
    if (!profile?.publishedAt || profile.publishedAt >= to) return null;
    if (to.getTime() + RECAP_GRACE_MS > now.getTime()) return null; // not built yet: don't call it quiet
    const row = await this.build(actor.userId, month);
    if (!row) return { kind: "quiet", month };
    return row.seenAt ? null : { kind: "recap", recap: toDTO(row) };
  }

  async markSeen(actor: Actor, recapId: string): Promise<void> {
    await this.deps.repos.engagement.markRecapSeen(actor.userId, recapId, this.now());
  }

  /**
   * Daily job; does work from the 1st until every creator active last month has a recap and,
   * if they want one, an email. Each creator and each email is tried at most once per run.
   */
  async sendMonthlyRecaps(ctx: JobContext): Promise<JobResult> {
    const repo = this.deps.repos.engagement;
    const month = previousMonth(monthKey(ctx.now));
    const { from, to } = monthRange(month);
    if (to.getTime() + RECAP_GRACE_MS > ctx.now.getTime()) return { processed: 0, errors: 0, detail: { month } };
    let processed = 0;
    let errors = 0;

    const built = new Set<string>();
    while (ctx.hasTime()) {
      const ids = (await repo.creatorsNeedingRecap(month, from, to, BATCH)).filter((id) => !built.has(id));
      if (!ids.length) break;
      for (const creatorId of ids) {
        if (!ctx.hasTime()) break;
        built.add(creatorId);
        try {
          await this.build(creatorId, month);
          processed++;
        } catch (err) {
          errors++;
          logger.error("recap build failed", { month, err });
        }
      }
    }

    const tried = new Set<string>();
    while (ctx.hasTime()) {
      const rows = (await repo.recapsToEmail(month, BATCH)).filter((r) => !tried.has(r.recap.id));
      if (!rows.length) break;
      for (const r of rows) {
        if (!ctx.hasTime()) break;
        tried.add(r.recap.id);
        if (!(await repo.claimRecapEmail(r.recap.id, ctx.now))) continue; // another run has it
        try {
          const s = r.recap.stats;
          await this.deps.email.send({
            to: r.email,
            ...monthlyRecapTemplate({
              name: r.name ?? r.displayName,
              month: formatMonth(month),
              supporters: s.supporters,
              newSupporters: s.newSupporters,
              productsSold: s.productsSold,
              received: formatSLECompact(s.receivedNetMinor),
              bestMonth: s.bestMonth,
              url: `${this.deps.appBaseUrl}/dashboard/highlights?month=${month}`,
              settingsUrl: `${this.deps.appBaseUrl}/dashboard/settings#emails`,
            }),
          });
          processed++;
        } catch (err) {
          errors++;
          await repo.releaseRecapEmail(r.recap.id).catch(() => {});
          logger.error("recap email failed", { month, err });
        }
      }
    }
    return { processed, errors, detail: { month } };
  }
}
