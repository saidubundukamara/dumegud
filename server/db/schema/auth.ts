import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, timestamps } from "./columns";

// Auth tables (implementation.md Phase 1). `users`, `accounts` and `verification_tokens` follow
// the Auth.js Drizzle adapter shape so Google sign-in can create and link users. Sessions are
// JWTs, so there is no `sessions` table.

export const userRole = pgEnum("user_role", ["creator", "staff", "super_admin"]);
export const userStatus = pgEnum("user_status", ["active", "restricted", "suspended", "closed"]);
export const authEventType = pgEnum("auth_event_type", [
  "login_success",
  "login_failed",
  "logout",
  "logout_everywhere",
  "password_reset_requested",
  "password_changed",
  "email_verified",
  "google_linked",
]);

export type Role = (typeof userRole.enumValues)[number];
export type UserStatus = (typeof userStatus.enumValues)[number];
export type AuthEventType = (typeof authEventType.enumValues)[number];

export const users = pgTable(
  "users",
  {
    id: id(),
    name: text(),
    /** Always stored lowercased (enforced by a CHECK constraint). */
    email: text().notNull().unique(),
    emailVerified: timestamp({ withTimezone: true, mode: "date" }),
    image: text(),
    /** Argon2id PHC string. Null for Google-only accounts. */
    passwordHash: text(),
    role: userRole().notNull().default("creator"),
    status: userStatus().notNull().default("active"),
    /** Bumped to revoke every outstanding JWT (password change, suspension, sign out everywhere). */
    sessionVersion: integer().notNull().default(1),
    failedLoginCount: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
    /** `YYYY-MM-DD`, encrypted with encryptField. Null for accounts made before it was asked. */
    dateOfBirthEnc: text(),
    /**
     * True until the user gives a date of birth. Google sign-ups start without one and are sent to
     * /welcome/age; accounts that existed before the field (and seeded staff) are exempt.
     */
    dateOfBirthRequired: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [check("users_email_lowercase", sql`${t.email} = lower(${t.email})`)],
);

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text().notNull(),
    provider: text().notNull(),
    providerAccountId: text().notNull(),
    // Property names below are fixed by the Auth.js adapter.
    refresh_token: text(),
    access_token: text(),
    expires_at: integer(),
    token_type: text(),
    scope: text(),
    id_token: text(),
    session_state: text(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] }), index().on(t.userId)],
);

/** Email-verification tokens. `identifier` is the user id; `token` is the SHA-256 of the raw token. */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text().notNull(),
    token: text().notNull().unique(),
    expires: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the raw token; the raw token only ever exists in the emailed link. */
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId)],
);

/** Append-only security log. */
export const authEvents = pgTable(
  "auth_events",
  {
    id: id(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    type: authEventType().notNull(),
    ipHash: text(),
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);

/**
 * A creator asking to delete their account. The page goes offline at once; personal data is
 * erased after `eraseAfter` unless they cancel by signing back in. Money records are kept
 * (append-only), so the user row is anonymised rather than deleted.
 */
export const accountDeletions = pgTable(
  "account_deletions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    requestedAt: timestamp({ withTimezone: true }).notNull(),
    eraseAfter: timestamp({ withTimezone: true }).notNull(),
    canceledAt: timestamp({ withTimezone: true }),
    erasedAt: timestamp({ withTimezone: true }),
    /** A remainder too small to withdraw that the creator chose to give up (minor units). */
    forfeitedMinor: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("account_deletions_one_open_per_user")
      .on(t.userId)
      .where(sql`${t.canceledAt} is null and ${t.erasedAt} is null`),
    index().on(t.eraseAfter),
  ],
);

export type AccountDeletion = typeof accountDeletions.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
