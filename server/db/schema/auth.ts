import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
