import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { id, timestamps } from "./columns";
import { feeSource } from "./payments";

// KYC, payout methods and withdrawals (implementation.md Phase 6). Personal data that staff must
// read back (legal name, date of birth, phone number) is AES-256-GCM encrypted; lookups use
// peppered hashes.

export const kycIdType = pgEnum("kyc_id_type", ["national_id", "passport", "drivers_license", "voter_id"]);
export const kycStatus = pgEnum("kyc_status", ["pending", "approved", "rejected", "needs_more_info"]);
export const momoProvider = pgEnum("momo_provider", ["m17", "m18"]);
export const nameMatch = pgEnum("name_match", ["match", "partial", "mismatch", "unavailable"]);
export const payoutMethodStatus = pgEnum("payout_method_status", ["cooling_off", "active", "needs_recheck", "disabled"]);
export const payoutStatus = pgEnum("payout_status", ["requested", "in_review", "processing", "completed", "failed", "canceled"]);

export type KycStatus = (typeof kycStatus.enumValues)[number];
export type KycIdType = (typeof kycIdType.enumValues)[number];
export type NameMatch = (typeof nameMatch.enumValues)[number];
export type PayoutMethodStatus = (typeof payoutMethodStatus.enumValues)[number];
export type PayoutStatus = (typeof payoutStatus.enumValues)[number];

export const kycSubmissions = pgTable(
  "kyc_submissions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    legalNameEnc: text().notNull(),
    dateOfBirthEnc: text().notNull(),
    idType: kycIdType().notNull(),
    /** Peppered HMAC of the normalised ID number: one document can verify only one account. */
    idNumberHash: text().notNull(),
    /** Keys in the private KYC bucket (re-encoded, EXIF stripped). */
    idFrontKey: text().notNull(),
    idBackKey: text(),
    selfieKey: text().notNull(),
    status: kycStatus().notNull().default("pending"),
    reviewerId: uuid().references(() => users.id, { onDelete: "set null" }),
    reviewNotes: text(),
    rejectionReasonCode: text(),
    reviewedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index().on(t.userId, t.createdAt),
    index().on(t.status, t.createdAt),
    uniqueIndex("kyc_one_approved_per_document").on(t.idNumberHash).where(sql`${t.status} = 'approved'`),
    uniqueIndex("kyc_one_open_per_user").on(t.userId).where(sql`${t.status} = 'pending'`),
  ],
);

export const payoutMethods = pgTable(
  "payout_methods",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    type: text().notNull().default("momo"),
    providerId: momoProvider().notNull(),
    /** `232XXXXXXXX`, encrypted. */
    msisdnEnc: text().notNull(),
    msisdnHash: text().notNull(),
    /** Last 3 digits, for display. */
    msisdnLast3: text().notNull(),
    holderName: text(),
    nameMatch: nameMatch().notNull(),
    status: payoutMethodStatus().notNull(),
    cooldownUntil: timestamp({ withTimezone: true }),
    boundAt: timestamp({ withTimezone: true }).notNull(),
    verifiedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("payout_methods_one_current_per_user").on(t.userId).where(sql`${t.status} <> 'disabled'`),
    index().on(t.msisdnHash),
  ],
);

export const payouts = pgTable(
  "payouts",
  {
    id: id(),
    creatorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    payoutMethodId: uuid()
      .notNull()
      .references(() => payoutMethods.id, { onDelete: "restrict" }),
    amountMinor: bigint({ mode: "number" }).notNull(),
    /** Monime's payout fee is charged on top of the amount. */
    quotedFeeMinor: bigint({ mode: "number" }).notNull(),
    feeMinor: bigint({ mode: "number" }),
    feeSource: feeSource(),
    totalDebitMinor: bigint({ mode: "number" }),
    currency: text().notNull().default("SLE"),
    status: payoutStatus().notNull(),
    reviewReason: text(),
    monimePayoutId: text().unique(),
    idempotencyKey: text().notNull().unique(),
    lastError: text(),
    failureCode: text(),
    failureMessage: text(),
    completionApplied: boolean().notNull().default(false),
    /** Masked destination as it was at request time. */
    destinationSnapshot: jsonb().notNull(),
    holderNameAtRequest: text(),
    reviewerId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Staff approvals for release ([{ by, at }]); large payouts need two different people. */
    approvals: jsonb().notNull().default(sql`'[]'::jsonb`),
    requestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("payouts_one_open_per_creator")
      .on(t.creatorId)
      .where(sql`${t.status} in ('requested', 'in_review', 'processing')`),
    index().on(t.status, t.requestedAt),
    index().on(t.creatorId, t.requestedAt),
    check("payouts_amount_positive", sql`${t.amountMinor} > 0`),
  ],
);

export type KycSubmission = typeof kycSubmissions.$inferSelect;
export type PayoutMethod = typeof payoutMethods.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
