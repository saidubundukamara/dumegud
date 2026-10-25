import "server-only";
import { decodeCursor, toPage } from "@/server/lib/cursor";
import { ConflictError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { pepperedHash } from "@/server/lib/hash";
import type { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import type { ProductRepository } from "@/server/repositories/ProductRepository";
import type { RiskRepository } from "@/server/repositories/RiskRepository";
import { assertPermission, type AdminActor, type RequestContext } from "./actor";
import type { AuditLogger } from "./compliance";
import { runInTransaction } from "./transaction";

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
    private readonly transaction: typeof runInTransaction = runInTransaction,
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

  async listOpen(actor: AdminActor) {
    return (await this.list(actor, "open", null)).rows;
  }

  /** Reports by status, newest first, with what each one is about (title or handle) and its creator. */
  async list(actor: AdminActor, status: "open" | "dismissed" | "actioned", cursor: unknown) {
    assertPermission(actor, "reports.view");
    const limit = 30;
    const page = toPage(await this.repos.risk.listReports(status, limit + 1, undefined, decodeCursor(cursor)), limit, (r) => r.createdAt);
    const rows = await Promise.all(
      page.rows.map(async (r) => {
        if (r.targetType === "product") {
          const product = await this.repos.products.findById(r.targetId);
          return { ...r, targetLabel: product?.title ?? "(deleted)", targetStatus: product?.status ?? null, creatorId: product?.creatorId ?? null };
        }
        const profile = await this.repos.profiles.findById(r.targetId);
        return { ...r, targetLabel: profile ? `@${profile.handle}` : "(deleted)", targetStatus: profile?.status ?? null, creatorId: profile?.userId ?? null };
      }),
    );
    return { rows, next: page.next };
  }

  /**
   * Take a creator page or product down, or put it back, outside of a report (staff found it
   * themselves, or a takedown was a mistake). Conditional on the status it is changing from, so
   * two staff acting at once can't both apply it. Restoring never re-publishes: a product goes
   * back to unpublished and a page to unpublished, and the creator publishes again (a product
   * through review).
   */
  async moderate(
    actor: AdminActor,
    input: { targetType: "creator" | "product"; targetId: string; action: "suspend" | "restore"; reason: string },
  ): Promise<ModerationChange> {
    assertPermission(actor, "reports.resolve");
    const reason = input.reason.trim().slice(0, 500);
    if (!reason) throw new ValidationError("Give a reason.");
    const tags = await this.transaction(async (tx) => {
      const tags: string[] = [];
      if (input.targetType === "product") {
        const from = input.action === "suspend" ? (["draft", "pending_review", "published", "unpublished"] as const) : (["suspended"] as const);
        const product = await this.repos.products.setStatus(input.targetId, from, input.action === "suspend" ? "suspended" : "unpublished", {}, tx);
        if (!product) throw new ConflictError(input.action === "suspend" ? "This product is already suspended." : "This product isn't suspended.");
        tags.push(`product:${product.id}`);
        const profile = await this.repos.profiles.findByUserId(product.creatorId, tx);
        if (profile) tags.push(`creator:${profile.id}`);
      } else {
        const profile = await this.repos.profiles.setStatusByStaffFrom(
          input.targetId,
          input.action === "suspend" ? ["draft", "published", "unpublished"] : ["suspended"],
          input.action === "suspend" ? "suspended" : "unpublished",
          tx,
        );
        if (!profile) throw new ConflictError(input.action === "suspend" ? "This page is already suspended." : "This page isn't suspended.");
        tags.push(`creator:${profile.id}`, `handle:${profile.handleLower}`);
      }
      await this.repos.risk.insertModerationAction({ targetType: input.targetType, targetId: input.targetId, action: input.action, reason, actorId: actor.adminId }, tx);
      return tags;
    });
    await this.audit.log({ actor, action: `moderation.${input.action}`, targetType: input.targetType, targetId: input.targetId, after: { reason } });
    return { tags };
  }

  async resolve(actor: AdminActor, reportId: string, input: { action: "dismiss" | "suspend"; reason: string }): Promise<ModerationChange> {
    assertPermission(actor, "reports.resolve");
    // One transaction: a report is only marked actioned if the suspension really happened.
    const { report, tags } = await this.transaction(async (tx) => {
      const report = await this.repos.risk.resolveReport(reportId, input.action === "dismiss" ? "dismissed" : "actioned", actor.adminId, this.now(), tx);
      if (!report) throw new NotFoundError("This report was already handled.");
      const tags: string[] = [];
      if (input.action === "suspend") {
        if (report.targetType === "product") {
          const product = await this.repos.products.setStatus(report.targetId, ["draft", "pending_review", "published", "unpublished"], "suspended", {}, tx);
          if (product) tags.push(`product:${product.id}`);
          const profile = product ? await this.repos.profiles.findByUserId(product.creatorId, tx) : null;
          if (profile) tags.push(`creator:${profile.id}`);
        } else {
          const profile = await this.repos.profiles.setStatusByStaff(report.targetId, "suspended", tx);
          if (profile) tags.push(`creator:${profile.id}`, `handle:${profile.handleLower}`);
        }
        await this.repos.risk.insertModerationAction({ targetType: report.targetType, targetId: report.targetId, action: "suspend", reason: input.reason, actorId: actor.adminId }, tx);
      }
      return { report, tags };
    });
    await this.audit.log({
      actor,
      action: `report.${input.action}`,
      targetType: report.targetType,
      targetId: report.targetId,
      after: { reportId, reason: input.reason },
    });
    return { tags };
  }
}
