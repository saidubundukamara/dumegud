import "server-only";
import type { CaseDecision, RestrictionFeature, RiskCase } from "@/server/db/schema";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/lib/errors";
import type { LedgerRepository } from "@/server/repositories/LedgerRepository";
import type { RiskRepository } from "@/server/repositories/RiskRepository";
import { isStaff, type Actor } from "./actor";
import type { AuditLogger } from "./compliance";
import { accounts } from "./ledger";
import type { PlatformSettingsService } from "./PlatformSettingsService";
import { runInTransaction } from "./transaction";

const RESTRICTING: CaseDecision[] = ["restrict", "pause_feature", "restore"];

export type DecisionInput = {
  decision: CaseDecision;
  /** For pause_feature. */
  feature?: Exclude<RestrictionFeature, "all">;
  notes: string;
};

/**
 * Review cases (PRD §6.4). Staff group alerts into a case, add notes and decide. Restricting,
 * pausing a feature or restoring a creator who is owed at least the configured amount needs a
 * second, different staff member to confirm (dual approval). Every step is audited.
 */
export class CaseService {
  constructor(
    private readonly repos: { risk: RiskRepository; ledger: LedgerRepository },
    private readonly settings: Pick<PlatformSettingsService, "get">,
    private readonly audit: AuditLogger,
    private readonly now: () => Date = () => new Date(),
    private readonly transaction: typeof runInTransaction = runInTransaction,
  ) {}

  async openCase(actor: Actor, input: { creatorId: string; alertIds: string[]; note: string }): Promise<RiskCase> {
    this.staff(actor);
    const alerts = await this.repos.risk.findAlerts(input.alertIds);
    if (alerts.some((a) => a.creatorId !== input.creatorId)) throw new ValidationError("Those alerts belong to different creators.");
    const created = await this.transaction(async (tx) => {
      const c = await this.repos.risk.insertCase(
        {
          creatorId: input.creatorId,
          reasonCodes: [...new Set(alerts.map((a) => a.ruleCode))],
          assigneeId: actor.userId,
          notes: input.note ? [{ by: actor.userId, at: this.now().toISOString(), text: input.note }] : [],
        },
        tx,
      );
      await this.repos.risk.updateAlerts(input.alertIds, { status: "escalated", caseId: c.id }, tx);
      return c;
    });
    await this.audit.log({ actor, action: "case.open", targetType: "risk_case", targetId: created.id, after: { creatorId: input.creatorId, alertIds: input.alertIds } });
    return created;
  }

  async dismissAlert(actor: Actor, alertId: string): Promise<void> {
    this.staff(actor);
    await this.repos.risk.updateAlerts([alertId], { status: "dismissed" });
    await this.audit.log({ actor, action: "alert.dismiss", targetType: "risk_alert", targetId: alertId });
  }

  async addNote(actor: Actor, caseId: string, text: string): Promise<void> {
    this.staff(actor);
    const c = await this.repos.risk.findCase(caseId);
    if (!c) throw new NotFoundError();
    const notes = [...((c.notes as unknown[]) ?? []), { by: actor.userId, at: this.now().toISOString(), text: text.slice(0, 2000) }];
    await this.repos.risk.updateCase(caseId, { notes });
    await this.audit.log({ actor, action: "case.note", targetType: "risk_case", targetId: caseId });
  }

  /** Returns whether the decision took effect (false = waiting for a second approver). */
  async decide(actor: Actor, caseId: string, input: DecisionInput): Promise<{ applied: boolean }> {
    this.staff(actor);
    if (input.decision === "pause_feature" && !input.feature) throw new ValidationError("Choose which feature to pause.");
    const settings = await this.settings.get();

    const result = await this.transaction(async (tx) => {
      const c = await this.repos.risk.lockCase(caseId, tx);
      if (!c) throw new NotFoundError();
      if (c.status === "closed") throw new ConflictError("This case is closed.");
      const approvals = [...((c.approvals as unknown[]) ?? []), { by: actor.userId, at: this.now().toISOString(), decision: input.decision }];

      const owed = -(await this.repos.ledger.balance(accounts.creatorPayable(c.creatorId), tx));
      const needsSecond = RESTRICTING.includes(input.decision) && owed >= settings.dualApprovalMinBalanceMinor;
      const pending = c.pendingDecision as (DecisionInput & { by: string }) | null;

      if (needsSecond && !pending) {
        await this.repos.risk.updateCase(caseId, { status: "awaiting_approval", pendingDecision: { ...input, by: actor.userId }, approvals }, tx);
        return { applied: false, before: c };
      }
      if (needsSecond && pending) {
        if (pending.by === actor.userId) throw new ForbiddenError("A different staff member must approve this decision.");
        if (pending.decision !== input.decision || pending.feature !== input.feature) {
          throw new ConflictError("This doesn't match the decision waiting for approval.");
        }
      }

      await this.apply(c, input, actor, tx);
      const closes = input.decision !== "request_info" && input.decision !== "escalate";
      await this.repos.risk.updateCase(
        caseId,
        {
          status: input.decision === "request_info" ? "info_requested" : input.decision === "escalate" ? "escalated" : "closed",
          decision: input.decision,
          decisionNotes: input.notes,
          pendingDecision: null,
          approvals,
        },
        tx,
      );
      if (closes) {
        const alerts = await this.repos.risk.listAlerts("escalated", 500, tx);
        await this.repos.risk.updateAlerts(
          alerts.filter((a) => a.caseId === caseId).map((a) => a.id),
          { status: input.decision === "dismiss" ? "dismissed" : "actioned" },
          tx,
        );
      }
      return { applied: true, before: c };
    });

    await this.audit.log({
      actor,
      action: result.applied ? `case.decide.${input.decision}` : `case.propose.${input.decision}`,
      targetType: "risk_case",
      targetId: caseId,
      before: { status: result.before.status },
      after: { decision: input.decision, feature: input.feature ?? null, notes: input.notes },
    });
    return { applied: result.applied };
  }

  async listOpen(actor: Actor) {
    this.staff(actor);
    return this.repos.risk.listCases();
  }

  async listAlerts(actor: Actor) {
    this.staff(actor);
    return this.repos.risk.listAlerts("open");
  }

  private async apply(c: RiskCase, input: DecisionInput, actor: Actor, tx: Parameters<RiskRepository["insertRestriction"]>[1]) {
    if (input.decision === "restrict" || input.decision === "pause_feature") {
      await this.repos.risk.insertRestriction(
        { userId: c.creatorId, feature: input.decision === "restrict" ? "all" : input.feature!, reason: input.notes || input.decision, caseId: c.id, createdBy: actor.userId },
        tx,
      );
    }
    if (input.decision === "restore") await this.repos.risk.liftRestrictions(c.creatorId, actor.userId, this.now(), tx);
  }

  private staff(actor: Actor) {
    if (!isStaff(actor.role)) throw new ForbiddenError();
  }
}
