import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, id, timestamps } from "./columns";
import { riskTier, verificationTier } from "./creators";

// Risk, limits, cases, reports and the audit log (implementation.md Phase 7, PRD §6).

export const limitScope = pgEnum("limit_scope", [
  "per_contribution",
  "supporter_to_creator",
  "supporter_global",
  "creator_receipts",
  "creator_payouts",
  "velocity_count",
]);
export const limitWindow = pgEnum("limit_window", ["single", "24h", "7d", "30d"]);
export const limitAction = pgEnum("limit_action", ["block", "review", "flag"]);
export const alertSeverity = pgEnum("alert_severity", ["low", "medium", "high"]);
export const alertSubject = pgEnum("alert_subject", ["creator", "payment", "payout", "product", "platform"]);
export const alertStatus = pgEnum("alert_status", ["open", "dismissed", "escalated", "actioned"]);
export const caseStatus = pgEnum("risk_case_status", ["open", "info_requested", "escalated", "awaiting_approval", "closed"]);
export const caseDecision = pgEnum("risk_case_decision", ["dismiss", "request_info", "restrict", "pause_feature", "escalate", "restore"]);
export const restrictionFeature = pgEnum("restriction_feature", ["receive", "withdraw", "publish", "upload", "all"]);
export const reportTarget = pgEnum("report_target", ["creator", "product"]);
export const reportReason = pgEnum("report_reason", ["scam", "impersonation", "copyright", "illegal", "other"]);
export const reportStatus = pgEnum("report_status", ["open", "dismissed", "actioned"]);

export type LimitScope = (typeof limitScope.enumValues)[number];
export type LimitWindow = (typeof limitWindow.enumValues)[number];
export type LimitAction = (typeof limitAction.enumValues)[number];
export type AlertSeverity = (typeof alertSeverity.enumValues)[number];
export type RestrictionFeature = (typeof restrictionFeature.enumValues)[number];
export type CaseDecision = (typeof caseDecision.enumValues)[number];

/** Admin-managed limits. Null tier/rail columns mean "applies to all". */
export const transactionLimits = pgTable(
  "transaction_limits",
  {
    id: id(),
    scope: limitScope().notNull(),
    window: limitWindow().notNull(),
    verificationTier: verificationTier(),
    riskTier: riskTier(),
    rail: text(),
    maxAmountMinor: bigint({ mode: "number" }),
    maxCount: integer(),
    action: limitAction().notNull(),
    active: boolean().notNull().default(true),
    updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [index().on(t.scope, t.active)],
);

export const riskRules = pgTable("risk_rules", {
  code: text().primaryKey(),
  description: text().notNull(),
  params: jsonb().notNull(),
  severity: alertSeverity().notNull(),
  active: boolean().notNull().default(true),
  updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const riskCases = pgTable(
  "risk_cases",
  {
    id: id(),
    creatorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reasonCodes: text().array().notNull().default(sql`'{}'::text[]`),
    assigneeId: uuid().references(() => users.id, { onDelete: "set null" }),
    status: caseStatus().notNull().default("open"),
    decision: caseDecision(),
    decisionNotes: text(),
    /** Pending decision awaiting a second staff member: { decision, feature?, notes, by, at }. */
    pendingDecision: jsonb(),
    /** Every approval/decision, append-only by convention: [{ by, at, decision }]. */
    approvals: jsonb().notNull().default(sql`'[]'::jsonb`),
    notes: jsonb().notNull().default(sql`'[]'::jsonb`),
    ...timestamps(),
  },
  (t) => [index().on(t.status, t.createdAt), index().on(t.creatorId)],
);

/** Signals, not allegations (PRD §6.3). */
export const riskAlerts = pgTable(
  "risk_alerts",
  {
    id: id(),
    ruleCode: text().notNull(),
    subjectType: alertSubject().notNull(),
    subjectId: uuid().notNull(),
    /** The creator the alert concerns (for case grouping). */
    creatorId: uuid().references(() => users.id, { onDelete: "restrict" }),
    severity: alertSeverity().notNull(),
    evidence: jsonb().notNull(),
    status: alertStatus().notNull().default("open"),
    caseId: uuid().references(() => riskCases.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.status, t.createdAt), index().on(t.ruleCode, t.subjectId, t.createdAt), index().on(t.creatorId)],
);

export const accountRestrictions = pgTable(
  "account_restrictions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    feature: restrictionFeature().notNull(),
    reason: text().notNull(),
    caseId: uuid().references(() => riskCases.id, { onDelete: "set null" }),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp({ withTimezone: true }),
    liftedAt: timestamp({ withTimezone: true }),
    liftedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId, t.liftedAt)],
);

export const contentReports = pgTable(
  "content_reports",
  {
    id: id(),
    targetType: reportTarget().notNull(),
    targetId: uuid().notNull(),
    reason: reportReason().notNull(),
    details: text().notNull().default(""),
    reporterEmailHash: text(),
    ipHash: text(),
    status: reportStatus().notNull().default("open"),
    resolvedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.status, t.createdAt), index().on(t.targetType, t.targetId)],
);

export const moderationActions = pgTable("moderation_actions", {
  id: id(),
  targetType: text().notNull(),
  targetId: uuid().notNull(),
  action: text().notNull(),
  reason: text().notNull(),
  actorId: uuid().references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/** Append-only (a trigger rejects UPDATE/DELETE for every role). */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: uuid(),
    actorRole: text(),
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: text(),
    before: jsonb(),
    after: jsonb(),
    ipHash: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.targetType, t.targetId, t.createdAt), index().on(t.actorId, t.createdAt)],
);

/** Every platform_settings change (append-only). */
export const platformSettingsHistory = pgTable(
  "platform_settings_history",
  {
    id: id(),
    key: text().notNull(),
    value: jsonb().notNull(),
    version: integer().notNull(),
    changedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.key, t.version)],
);

export type TransactionLimit = typeof transactionLimits.$inferSelect;
export type RiskAlert = typeof riskAlerts.$inferSelect;
export type RiskCase = typeof riskCases.$inferSelect;
export type AccountRestriction = typeof accountRestrictions.$inferSelect;
export type ContentReport = typeof contentReports.$inferSelect;
