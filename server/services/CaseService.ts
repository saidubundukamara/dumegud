import "server-only";
import type { CaseDecision, RestrictionFeature, RiskAlert, RiskCase } from "@/server/db/schema";
import { decodeCursor, toPage, type Page } from "@/server/lib/cursor";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/lib/errors";
import type { LedgerRepository } from "@/server/repositories/LedgerRepository";
import type { RiskRepository } from "@/server/repositories/RiskRepository";
import { assertPermission, type AdminActor } from "./actor";
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

  async openCase(actor: AdminActor, input: { creatorId: string; alertIds: string[]; note: string }): Promise<RiskCase> {
    assertPermission(actor, "risk.cases");
    const created = await this.transaction(async (tx) => {
      // Serialises case opening per creator, so a manual case can't be opened twice at once.
      if (!(await this.repos.risk.lockCreator(input.creatorId, tx))) throw new NotFoundError();
      if (!input.alertIds.length && (await this.repos.risk.openCaseForCreator(input.creatorId, tx))) {
        throw new ConflictError("This creator already has an open case. Add a note to it instead.");
      }
      const alerts = await this.repos.risk.findAlerts(input.alertIds, tx);
      if (alerts.some((a) => a.creatorId !== input.creatorId)) throw new ValidationError("Those alerts belong to different creators.");
      const c = await this.repos.risk.insertCase(
        {
          creatorId: input.creatorId,
          reasonCodes: [...new Set(alerts.map((a) => a.ruleCode))],
          assigneeId: actor.adminId,
          notes: input.note ? [{ by: actor.adminId, at: this.now().toISOString(), text: input.note }] : [],
        },
        tx,
      );
      // Claimed atomically: two staff opening cases from the same alerts can't both take them.
      const claimed = await this.repos.risk.claimAlertsForCase(input.alertIds, c.id, input.creatorId, tx);
      if (claimed.length !== new Set(input.alertIds).size) {
        throw new ConflictError("Some of those alerts were just dismissed or added to another case. Reload and try again.");
      }
      return c;
    });
    await this.audit.log({ actor, action: "case.open", targetType: "risk_case", targetId: created.id, after: { creatorId: input.creatorId, alertIds: input.alertIds } });
    return created;
  }

  async dismissAlert(actor: AdminActor, alertId: string): Promise<void> {
    assertPermission(actor, "risk.cases");
    if (!(await this.repos.risk.dismissOpenAlert(alertId))) throw new ConflictError("This alert is no longer open.");
    await this.audit.log({ actor, action: "alert.dismiss", targetType: "risk_alert", targetId: alertId });
  }

  async addNote(actor: AdminActor, caseId: string, text: string): Promise<void> {
    assertPermission(actor, "risk.cases");
    const note = { by: actor.adminId, at: this.now().toISOString(), text: text.slice(0, 2000) };
    if (!(await this.repos.risk.appendCaseNote(caseId, note))) throw new NotFoundError();
    await this.audit.log({ actor, action: "case.note", targetType: "risk_case", targetId: caseId });
  }

  /** Returns whether the decision took effect (false = waiting for a second approver). */
  async decide(actor: AdminActor, caseId: string, input: DecisionInput): Promise<{ applied: boolean }> {
    assertPermission(actor, "risk.cases");
    if (input.decision === "pause_feature" && !input.feature) throw new ValidationError("Choose which feature to pause.");
    const settings = await this.settings.get();

    const result = await this.transaction(async (tx) => {
      const c = await this.repos.risk.lockCase(caseId, tx);
      if (!c) throw new NotFoundError();
      if (c.status === "closed") throw new ConflictError("This case is closed.");
      const approvals = [...((c.approvals as unknown[]) ?? []), { by: actor.adminId, at: this.now().toISOString(), decision: input.decision }];

      const owed = -(await this.repos.ledger.balance(accounts.creatorPayable(c.creatorId), tx));
      const needsSecond = RESTRICTING.includes(input.decision) && owed >= settings.dualApprovalMinBalanceMinor;
      const pending = c.pendingDecision as (DecisionInput & { by: string }) | null;

      if (needsSecond && !pending) {
        await this.repos.risk.updateCase(caseId, { status: "awaiting_approval", pendingDecision: { ...input, by: actor.adminId }, approvals }, tx);
        return { applied: false, before: c };
      }
      if (needsSecond && pending) {
        if (pending.by === actor.adminId) throw new ForbiddenError("A different admin must approve this decision.");
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
        await this.repos.risk.closeCaseAlerts(caseId, input.decision === "dismiss" ? "dismissed" : "actioned", tx);
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

  async listOpen(actor: AdminActor) {
    assertPermission(actor, "risk.view");
    return this.repos.risk.listCases();
  }

  async listAlerts(actor: AdminActor) {
    assertPermission(actor, "risk.view");
    return this.repos.risk.listAlerts("open");
  }

  /** Alerts by status, newest first. */
  async alertsPage(actor: AdminActor, status: RiskAlert["status"], cursor: unknown): Promise<Page<RiskAlert>> {
    assertPermission(actor, "risk.view");
    const limit = 30;
    return toPage(await this.repos.risk.listAlerts(status, limit + 1, undefined, decodeCursor(cursor)), limit, (a) => a.createdAt);
  }

  /** Closed cases, newest first. */
  async closedCasesPage(actor: AdminActor, cursor: unknown): Promise<Page<RiskCase>> {
    assertPermission(actor, "risk.view");
    const limit = 30;
    return toPage(await this.repos.risk.listClosedCases(limit + 1, undefined, decodeCursor(cursor)), limit, (c) => c.createdAt);
  }

  /** A case with the alerts grouped into it. */
  async caseDetail(actor: AdminActor, caseId: string) {
    assertPermission(actor, "risk.view");
    const c = await this.repos.risk.findCase(caseId);
    if (!c) throw new NotFoundError();
    const alerts = await this.repos.risk.alertsFor({ caseId });
    return { case: c, alerts };
  }

  /** Alerts and cases about one creator (creator detail page). */
  async forCreator(actor: AdminActor, creatorId: string) {
    assertPermission(actor, "risk.view");
    const [alerts, cases] = await Promise.all([this.repos.risk.alertsFor({ creatorId }, 20), this.repos.risk.casesForCreator(creatorId)]);
    return { alerts, cases };
  }

  private async apply(c: RiskCase, input: DecisionInput, actor: AdminActor, tx: Parameters<RiskRepository["insertRestriction"]>[1]) {
    if (input.decision === "restrict" || input.decision === "pause_feature") {
      await this.repos.risk.insertRestriction(
        { userId: c.creatorId, feature: input.decision === "restrict" ? "all" : input.feature!, reason: input.notes || input.decision, caseId: c.id, createdBy: actor.adminId },
        tx,
      );
    }
    if (input.decision === "restore") await this.repos.risk.liftRestrictions(c.creatorId, actor.adminId, this.now(), tx);
  }
}
