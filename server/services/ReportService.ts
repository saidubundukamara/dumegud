import "server-only";
import { ForbiddenError, NotFoundError } from "@/server/lib/errors";
import { pepperedHash } from "@/server/lib/hash";
import type { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import type { ProductRepository } from "@/server/repositories/ProductRepository";
import type { RiskRepository } from "@/server/repositories/RiskRepository";
import { isStaff, type Actor, type RequestContext } from "./actor";
import type { AuditLogger } from "./compliance";

export type ReportInput = {
  targetType: "creator" | "product";
  targetId: string;
  reason: "scam" | "impersonation" | "copyright" | "illegal" | "other";
  details: string;
  reporterEmail: string | null;
};

/** Cache tags to refresh after a takedown (ids only). */
export type ModerationChange = { tags: string[] };

/**
 * Public reports on creator pages and products (PRD §6.5) and the staff moderation queue.
 * Suspending content is a moderation action: recorded, audited and reflected on public pages.
 */
export class ReportService {
  constructor(
    private readonly repos: { risk: RiskRepository; products: ProductRepository; profiles: CreatorProfileRepository },
    private readonly audit: AuditLogger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Always succeeds for a real target; reports for unknown targets are refused quietly. */
  async submit(input: ReportInput, ctx: RequestContext): Promise<void> {
    const exists =
      input.targetType === "product" ? await this.repos.products.findById(input.targetId) : await this.repos.profiles.findById(input.targetId);
    if (!exists) throw new NotFoundError("We couldn't find what you're reporting.");
    await this.repos.risk.insertReport({
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      details: input.details,
      reporterEmailHash: input.reporterEmail ? pepperedHash("reporter-email", input.reporterEmail) : null,
      ipHash: ctx.ip !== "unknown" ? pepperedHash("ip", ctx.ip) : null,
    });
  }

  async listOpen(actor: Actor) {
    this.staff(actor);
    const reports = await this.repos.risk.listReports("open");
    return Promise.all(
      reports.map(async (r) => {
        const label =
          r.targetType === "product"
            ? (await this.repos.products.findById(r.targetId))?.title
            : (await this.repos.profiles.findById(r.targetId))?.handle;
        return { ...r, targetLabel: label ?? "(deleted)" };
      }),
    );
  }

  async resolve(actor: Actor, reportId: string, input: { action: "dismiss" | "suspend"; reason: string }): Promise<ModerationChange> {
    this.staff(actor);
    const report = await this.repos.risk.resolveReport(reportId, input.action === "dismiss" ? "dismissed" : "actioned", actor.userId, this.now());
    if (!report) throw new NotFoundError("This report was already handled.");
    const tags: string[] = [];
    if (input.action === "suspend") {
      if (report.targetType === "product") {
        const product = await this.repos.products.setStatus(report.targetId, ["draft", "pending_review", "published", "unpublished"], "suspended");
        if (product) tags.push(`product:${product.id}`);
        const profile = product ? await this.repos.profiles.findByUserId(product.creatorId) : null;
        if (profile) tags.push(`creator:${profile.id}`);
      } else {
        const profile = await this.repos.profiles.setStatusByStaff(report.targetId, "suspended");
        if (profile) tags.push(`creator:${profile.id}`, `handle:${profile.handleLower}`);
      }
      await this.repos.risk.insertModerationAction({ targetType: report.targetType, targetId: report.targetId, action: "suspend", reason: input.reason, actorId: actor.userId });
    }
    await this.audit.log({
      actor,
      action: `report.${input.action}`,
      targetType: report.targetType,
      targetId: report.targetId,
      after: { reportId, reason: input.reason },
    });
    return { tags };
  }

  private staff(actor: Actor) {
    if (!isStaff(actor.role)) throw new ForbiddenError();
  }
}
