import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, id, timestamps } from "./columns";

// Creator profile, handle and wallet tables (implementation.md Phase 2).

export const profileStatus = pgEnum("creator_profile_status", ["draft", "published", "unpublished", "suspended"]);
export const verificationTier = pgEnum("creator_verification_tier", ["none", "email", "id_verified"]);
export const riskTier = pgEnum("creator_risk_tier", ["low", "medium", "high", "restricted"]);
export const socialPlatform = pgEnum("social_platform", [
  "website",
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "x",
  "linkedin",
  "spotify",
  "soundcloud",
]);
export const walletStatus = pgEnum("creator_wallet_status", ["pending", "active", "failed", "frozen"]);

export type ProfileStatus = (typeof profileStatus.enumValues)[number];
export type SocialPlatform = (typeof socialPlatform.enumValues)[number];
export type WalletStatus = (typeof walletStatus.enumValues)[number];

/** Admin-managed list (seeded in migration 0001). */
export const categories = pgTable("categories", {
  id: id(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  active: boolean().notNull().default(true),
  position: smallint().notNull().default(0),
});

export const creatorProfiles = pgTable(
  "creator_profiles",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    /** As the creator typed it (display casing). */
    handle: text().notNull(),
    /** Lookup key: uniqueness is case-insensitive. */
    handleLower: text().notNull().unique(),
    handleChangedAt: timestamp({ withTimezone: true }),
    displayName: text().notNull(),
    bio: text().notNull().default(""),
    /** Key in the public R2 bucket. */
    avatarKey: text(),
    categoryId: uuid().references(() => categories.id, { onDelete: "set null" }),
    suggestedAmountsMinor: integer()
      .array()
      .notNull()
      .default(sql`'{2000,5000,10000}'::integer[]`),
    supportMessageEnabled: boolean().notNull().default(true),
    /** Email the monthly recap on the 1st. */
    recapEmails: boolean().notNull().default(true),
    /** Email when a milestone is reached. */
    milestoneEmails: boolean().notNull().default(true),
    status: profileStatus().notNull().default("draft"),
    publishedAt: timestamp({ withTimezone: true }),
    creatorTermsAcceptedAt: timestamp({ withTimezone: true }),
    verificationTier: verificationTier().notNull().default("none"),
    riskTier: riskTier().notNull().default("low"),
    ...timestamps(),
  },
  (t) => [
    check("creator_profiles_handle_lower", sql`${t.handleLower} = lower(${t.handle})`),
    check("creator_profiles_bio_length", sql`char_length(${t.bio}) <= 500`),
  ],
);

export const socialLinks = pgTable(
  "social_links",
  {
    id: id(),
    profileId: uuid()
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: "cascade" }),
    platform: socialPlatform().notNull(),
    url: text().notNull(),
    verifiedAt: timestamp({ withTimezone: true }),
    position: smallint().notNull().default(0),
  },
  (t) => [index().on(t.profileId), check("social_links_https", sql`${t.url} like 'https://%'`)],
);

/** Handles nobody can claim (routes, brand, staff). Admin-managed; seeded in migration 0001. */
export const reservedHandles = pgTable("reserved_handles", {
  handle: text().primaryKey(),
  createdAt: createdAt(),
});

/** Previous handles: they redirect to the current one and stay unclaimable for 90 days. */
export const handleHistory = pgTable(
  "handle_history",
  {
    handleLower: text().primaryKey(),
    profileId: uuid()
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: "cascade" }),
    releasedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index().on(t.profileId)],
);

/**
 * One Monime financial account per creator, created at sign-up. Keyed by user (not profile):
 * the wallet exists before the creator sets up a profile.
 */
export const creatorWallets = pgTable(
  "creator_wallets",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "restrict" }),
    monimeFinancialAccountId: text().unique(),
    uvan: text(),
    currency: text().notNull().default("SLE"),
    status: walletStatus().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    lastError: text(),
    lastAttemptAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index().on(t.status)],
);

export type CreatorProfile = typeof creatorProfiles.$inferSelect;
export type SocialLink = typeof socialLinks.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type CreatorWallet = typeof creatorWallets.$inferSelect;
