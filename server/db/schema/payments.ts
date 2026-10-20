import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { TRAFFIC_SOURCES } from "../../../lib/traffic-source";
import { users } from "./auth";
import { createdAt, id, timestamps } from "./columns";
import { socialPlatform } from "./creators";

// Payments, contributions and the double-entry ledger (implementation.md Phase 4, §3).
// All money columns are integer minor units of SLE.

export const paymentKind = pgEnum("payment_kind", ["contribution", "order"]);
export const paymentStatus = pgEnum("payment_status", [
  "created",
  "pending",
  "succeeded",
  "failed",
  "canceled",
  "expired",
  "reversed",
  "under_review",
]);
export const feeSource = pgEnum("monime_fee_source", ["reported", "estimated"]);
export const transferStatus = pgEnum("transfer_status", ["none", "pending", "completed", "failed"]);
export const paymentEventSource = pgEnum("payment_event_source", ["app", "webhook", "poll", "cron", "admin"]);
export const messageVisibility = pgEnum("message_visibility", ["public", "creator_only", "hidden_by_moderation"]);
/** Where the payer arrived from (attribution only; see lib/traffic-source.ts). */
export const trafficSource = pgEnum("traffic_source", TRAFFIC_SOURCES);

export type PaymentStatus = (typeof paymentStatus.enumValues)[number];
export type PaymentEventSource = (typeof paymentEventSource.enumValues)[number];
export type TransferStatus = (typeof transferStatus.enumValues)[number];

const minor = () => bigint({ mode: "number" });

export const payments = pgTable(
  "payments",
  {
    id: id(),
    kind: paymentKind().notNull(),
    /** The receiving creator's user id (wallet and ledger identity). */
    creatorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: paymentStatus().notNull().default("created"),
    grossMinor: minor().notNull(),
    currency: text().notNull().default("SLE"),
    /** Monime's collection fee used for the split. NULL = not known yet (never coerce to 0). */
    monimeFeeMinor: minor(),
    monimeFeeSource: feeSource(),
    /** A reported fee that arrived after the split was frozen on an estimate (variance posted). */
    lateReportedFeeMinor: minor(),
    arrivedMinor: minor(),
    /** Snapshot of the platform fee rate at checkout start. */
    platformFeeBps: integer().notNull(),
    platformFeeMinor: minor(),
    creatorNetMinor: minor(),
    monimeCheckoutSessionId: text().unique(),
    checkoutUrl: text(),
    monimePaymentId: text().unique(),
    financialTransactionReference: text(),
    channelReference: text(),
    channelProvider: text(),
    payerFingerprintHash: text(),
    ipHash: text(),
    idempotencyKey: text().notNull().unique(),
    lastError: text(),
    /** Set when a limit said "review" at checkout: settlement sends the payment to review, not success. */
    reviewHold: text(),
    /** Staff released this payment from review: limit holds don't apply to it again. */
    reviewApprovedAt: timestamp({ withTimezone: true }),
    trafficSource: trafficSource(),
    settledAt: timestamp({ withTimezone: true }),
    /** True once money moved to the creator: the split can never change after this. */
    settlementFrozen: boolean().notNull().default(false),
    transferId: text(),
    transferStatus: transferStatus().notNull().default("none"),
    /** Definitive transfer failures so far; part of the next transfer's idempotency key. */
    transferAttempts: integer().notNull().default(0),
    expiresAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index().on(t.creatorId, t.status, t.createdAt),
    index().on(t.status, t.createdAt),
    index().on(t.payerFingerprintHash, t.settledAt),
    index().on(t.ipHash, t.createdAt),
    // retry-transfers cron (Phase 9): succeeded payments whose transfer hasn't completed.
    index("payments_transfer_retry_index")
      .on(t.transferStatus, t.updatedAt)
      .where(sql`${t.status} = 'succeeded' and ${t.transferStatus} <> 'completed'`),
    check("payments_gross_positive", sql`${t.grossMinor} > 0`),
  ],
);

export const contributions = pgTable("contributions", {
  id: id(),
  paymentId: uuid()
    .notNull()
    .unique()
    .references(() => payments.id, { onDelete: "cascade" }),
  creatorId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  supporterName: text(),
  message: text(),
  isAnonymous: boolean().notNull().default(false),
  messageVisibility: messageVisibility().notNull().default("creator_only"),
  /** Self-declared, unverified social handle for shout-outs (lower-case, no @). */
  socialPlatform: socialPlatform(),
  socialHandle: text(),
  /** The supporter agreed to be named in the creator's thank-you posts. */
  shoutoutConsent: boolean().notNull().default(false),
  shoutoutConsentAt: timestamp({ withTimezone: true }),
  /** sha256 of the support claim cookie: lets the paying browser add a handle after checkout. */
  claimHash: text(),
  /** Included in (or reviewed for) a thank-you post the creator marked as posted. */
  thankedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index().on(t.creatorId, t.thankedAt),
  check("contributions_handle_pair", sql`(${t.socialHandle} is null) = (${t.socialPlatform} is null)`),
  check("contributions_anonymous_no_shoutout", sql`not (${t.isAnonymous} and ${t.shoutoutConsent})`),
]);

/** A thank-you post the creator generated and marked as posted. */
export const shoutouts = pgTable(
  "shoutouts",
  {
    id: id(),
    creatorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    period: text().notNull(),
    platform: socialPlatform().notNull(),
    includeTop: boolean().notNull().default(false),
    /** Contributions named in the post. */
    contributionIds: uuid().array().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.creatorId, t.createdAt)],
);

/** Append-only audit of every payment status change. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: id(),
    paymentId: uuid()
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    fromStatus: paymentStatus(),
    toStatus: paymentStatus().notNull(),
    source: paymentEventSource().notNull(),
    providerEventId: text(),
    detail: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.paymentId, t.createdAt)],
);

/**
 * Double-entry ledger. A journal is one balanced business event with a unique idempotency key
 * (`settle:{paymentId}`, `transfer:{paymentId}`, `variance:{spm}`); its lines must sum to zero
 * (debits positive, credits negative). Append-only: corrections are new journals.
 */
export const ledgerJournals = pgTable("ledger_journals", {
  id: id(),
  idempotencyKey: text().notNull().unique(),
  kind: text().notNull(),
  paymentId: uuid().references(() => payments.id, { onDelete: "restrict" }),
  memo: text(),
  createdAt: createdAt(),
});

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: id(),
    journalId: uuid()
      .notNull()
      .references(() => ledgerJournals.id, { onDelete: "restrict" }),
    /** e.g. `platform_cash`, `creator_payable:{userId}`, `creator_wallet:{userId}`. */
    account: text().notNull(),
    /** Signed minor units: debit > 0, credit < 0. */
    amountMinor: minor().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex().on(t.journalId, t.account),
    index().on(t.account, t.createdAt),
    check("ledger_entries_nonzero", sql`${t.amountMinor} <> 0`),
  ],
);

/** Admin-editable settings (fees, amount limits). Phase 8 adds the editor and history. */
export const platformSettings = pgTable("platform_settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  version: integer().notNull().default(1),
  updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type Payment = typeof payments.$inferSelect;
export type Contribution = typeof contributions.$inferSelect;
export type Shoutout = typeof shoutouts.$inferSelect;
