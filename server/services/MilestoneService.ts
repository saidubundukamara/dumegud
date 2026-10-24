import "server-only";
import {
  MILESTONE_KEYS,
  MILESTONES,
  nextMilestone,
  type MilestoneKey,
  type MilestoneMetric,
  type MilestoneTotals,
} from "@/lib/milestones";
import type { EmailService } from "@/server/integrations/email";
import { milestoneTemplate } from "@/server/integrations/email/templates";
import { logger } from "@/server/lib/logger";
import type { CreatorMilestone, Payment } from "@/server/db/schema";
import type { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import type { Crossing, EngagementRepository } from "@/server/repositories/EngagementRepository";
import type { Actor } from "./actor";
import type { JobContext, JobResult } from "./JobService";

const DAY_MS = 86_400_000;
/**
 * A milestone recorded more than this long after it was really reached is old news (history from
 * before milestones existed, a long-lost webhook): it's listed but never celebrated or emailed.
 * Decided from the dates alone, so the webhook and the sweep always agree on it.
 */
export const CELEBRATE_WITHIN_MS = 3 * DAY_MS;
const YEAR_DAYS = MILESTONES.one_year.threshold;
const BATCH = 50;

export type MilestoneDTO = {
  id: string;
  key: MilestoneKey;
  title: string;
  you: string;
  achievedAt: Date;
  /** Not celebrated yet on the dashboard. */
  isNew: boolean;
};

export type MilestoneOverviewDTO = {
  reached: MilestoneDTO[];
  next: { key: MilestoneKey; title: string; progress: number; remaining: string } | null;
};

export type MilestoneServiceDeps = {
  repos: { engagement: EngagementRepository; profiles: CreatorProfileRepository };
  email: EmailService;
  appBaseUrl: string;
  now?: () => Date;
};

const toDTO = (m: CreatorMilestone): MilestoneDTO => ({
  id: m.id,
  key: m.key,
  title: MILESTONES[m.key].title,
  you: MILESTONES[m.key].you,
  achievedAt: m.achievedAt,
  isNew: !m.silent && !m.seenAt,
});

/**
 * Milestones (first supporter, first sale, …). Every check recomputes from the creator's whole
 * settled history and inserts with ON CONFLICT DO NOTHING on (creator, key), so concurrent
 * webhooks and the daily sweep can run in any order: the row is written once, its date is the
 * real crossing date whoever writes it, and the email is claimed atomically before it's sent.
 */
export class MilestoneService {
  private readonly now: () => Date;

  constructor(private readonly deps: MilestoneServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** After a payment settles (SettlementService, after commit). Idempotent. */
  async checkAfterPayment(payment: Pick<Payment, "creatorId">): Promise<void> {
    const profile = await this.deps.repos.profiles.findByUserId(payment.creatorId);
    if (!profile) return;
    const created = await this.evaluate(payment.creatorId, profile.createdAt);
    for (const row of created) await this.sendEmail(row.id);
  }

  /**
   * Daily: one-year anniversaries, backfill for creators who had history before milestones
   * existed (recorded silently by date), anything a lost webhook skipped, and emails that failed.
   */
  async sweep(ctx: JobContext): Promise<JobResult> {
    let processed = 0;
    let errors = 0;
    let after: string | null = null;
    while (ctx.hasTime()) {
      const batch = await this.deps.repos.engagement.creatorsForSweep(
        new Date(ctx.now.getTime() - CELEBRATE_WITHIN_MS),
        new Date(ctx.now.getTime() - YEAR_DAYS * DAY_MS),
        after,
        BATCH,
      );
      if (!batch.length) break;
      for (const c of batch) {
        if (!ctx.hasTime()) break;
        after = c.creatorId;
        try {
          for (const row of await this.evaluate(c.creatorId, c.profileCreatedAt)) await this.sendEmail(row.id);
          processed++;
        } catch (err) {
          errors++;
          logger.error("milestone sweep failed for a creator", { err });
        }
      }
      if (batch.length < BATCH) break;
    }

    // Emails that failed (the claim was released) or were never sent.
    const tried = new Set<string>();
    while (ctx.hasTime()) {
      const due = (await this.deps.repos.engagement.milestonesToEmail(new Date(ctx.now.getTime() - 7 * DAY_MS), BATCH)).filter(
        (r) => !tried.has(r.milestone.id),
      );
      if (!due.length) break;
      for (const r of due) {
        if (!ctx.hasTime()) break;
        tried.add(r.milestone.id);
        if (await this.sendEmail(r.milestone.id)) processed++;
        else errors++;
      }
    }
    return { processed, errors };
  }

  /**
   * Also records anything reached but not written yet (before the first sweep, or after a lost
   * webhook): the same idempotent insert, no email from a page view (the sweep sends those).
   */
  async overview(actor: Actor): Promise<MilestoneOverviewDTO> {
    const profile = await this.deps.repos.profiles.findByUserId(actor.userId);
    if (profile) await this.evaluate(actor.userId, profile.createdAt);
    const rows = await this.deps.repos.engagement.listMilestones(actor.userId);
    const { totals } = await this.deps.repos.engagement.milestoneProgress(actor.userId, { supporters: [], receivedNetMinor: [], productsSold: [] });
    const all: MilestoneTotals = { ...totals, daysOnDuMeGud: profile ? this.daysSince(profile.createdAt) : 0 };
    const reached = new Set(rows.map((r) => r.key));
    const next = nextMilestone(all, reached);
    return {
      reached: rows.map(toDTO).reverse(),
      next: next ? { ...next, title: MILESTONES[next.key].title } : null,
    };
  }

  /** The newest milestone still to celebrate on the dashboard. */
  async latestUnseen(actor: Actor): Promise<MilestoneDTO | null> {
    const rows = await this.deps.repos.engagement.listMilestones(actor.userId);
    const fresh = rows.filter((r) => !r.silent && !r.seenAt);
    return fresh.length ? toDTO(fresh[fresh.length - 1]) : null;
  }

  /** Celebrating the newest one covers any older ones that piled up. */
  async markSeen(actor: Actor): Promise<void> {
    const rows = await this.deps.repos.engagement.listMilestones(actor.userId);
    const at = this.now();
    for (const r of rows) if (!r.seenAt && !r.silent) await this.deps.repos.engagement.markMilestoneSeen(actor.userId, r.id, at);
  }

  /** Owner-scoped: a reached milestone of the actor's, for the share card. */
  async getReached(actor: Actor, key: MilestoneKey): Promise<MilestoneDTO | null> {
    const rows = await this.deps.repos.engagement.listMilestones(actor.userId);
    const row = rows.find((r) => r.key === key);
    return row ? toDTO(row) : null;
  }

  /** Inserts every newly reached milestone; returns only the rows this call created. */
  private async evaluate(creatorId: string, profileCreatedAt: Date): Promise<CreatorMilestone[]> {
    const repo = this.deps.repos.engagement;
    const have = new Set((await repo.listMilestones(creatorId)).map((m) => m.key));
    const missing = MILESTONE_KEYS.filter((k) => !have.has(k));
    if (!missing.length) return [];

    const thresholdsFor = (metric: MilestoneMetric) => missing.filter((k) => MILESTONES[k].metric === metric).map((k) => MILESTONES[k].threshold);
    const wanted = { supporters: thresholdsFor("supporters"), receivedNetMinor: thresholdsFor("receivedNetMinor"), productsSold: thresholdsFor("productsSold") };
    const crossings: Crossing[] = [];
    if (wanted.supporters.length || wanted.receivedNetMinor.length || wanted.productsSold.length) {
      crossings.push(...(await repo.milestoneProgress(creatorId, wanted)).crossings);
    }

    const now = this.now();
    const values: Parameters<EngagementRepository["insertMilestones"]>[0] = [];
    for (const key of missing) {
      const m = MILESTONES[key];
      let at: Date | null = null;
      let paymentId: string | null = null;
      if (m.metric === "daysOnDuMeGud") {
        const due = new Date(profileCreatedAt.getTime() + m.threshold * DAY_MS);
        if (due <= now) at = due;
      } else {
        const hit = crossings.find((c) => c.metric === m.metric && c.threshold === m.threshold);
        if (hit) ({ at, paymentId } = hit);
      }
      if (!at) continue;
      values.push({ creatorId, key, achievedAt: at, paymentId, silent: now.getTime() - at.getTime() > CELEBRATE_WITHIN_MS });
    }
    return repo.insertMilestones(values);
  }

  /** Claim, send, and release the claim if sending failed (the sweep retries). Never throws. */
  private async sendEmail(milestoneId: string): Promise<boolean> {
    const repo = this.deps.repos.engagement;
    const row = await repo.findMilestoneEmailRow(milestoneId);
    if (!row || row.milestone.silent) return true; // opted out, or nothing to send
    if (!(await repo.claimMilestoneEmail(milestoneId, this.now()))) return true; // someone else has it
    try {
      const m = MILESTONES[row.milestone.key];
      await this.deps.email.send({
        to: row.email,
        ...milestoneTemplate({
          name: row.name ?? row.displayName,
          title: m.title,
          you: m.you,
          url: `${this.deps.appBaseUrl}/dashboard/highlights#milestones`,
          settingsUrl: `${this.deps.appBaseUrl}/dashboard/settings#emails`,
        }),
      });
      return true;
    } catch (err) {
      await repo.releaseMilestoneEmail(milestoneId).catch(() => {});
      logger.error("milestone email failed", { milestoneId, err });
      return false;
    }
  }

  private daysSince(d: Date): number {
    return Math.max(0, Math.floor((this.now().getTime() - d.getTime()) / DAY_MS));
  }
}
