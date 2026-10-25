import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, timestamps } from "./columns";

// Admin accounts are separate from creators (`users`): their own table, DB-backed sessions on
// the admin subdomain, password + TOTP, and role-based permissions (lib/admin-permissions.ts).
// Staff-actor columns elsewhere (reviewer_id, resolved_by, updated_by, …) reference `admins`.

export const adminStatus = pgEnum("admin_status", ["active", "suspended", "disabled"]);
export const adminAuthEventType = pgEnum("admin_auth_event_type", [
  "login_password_ok",
  "login_failed",
  "totp_failed",
  "login_success",
  "recovery_code_used",
  "totp_enrolled",
  "step_up_success",
  "step_up_failed",
  "logout",
  "session_revoked",
  "password_changed",
  "invite_accepted",
]);

export type AdminStatus = (typeof adminStatus.enumValues)[number];
export type AdminAuthEventType = (typeof adminAuthEventType.enumValues)[number];

export const admins = pgTable(
  "admins",
  {
    id: id(),
    /** Always stored lowercased (CHECK). */
    email: text().notNull().unique(),
    name: text().notNull(),
    /** Argon2id PHC string. */
    passwordHash: text().notNull(),
    status: adminStatus().notNull().default("active"),
    /** Bumped to revoke every session and step-up (suspension, password or role change). */
    sessionVersion: integer().notNull().default(1),
    failedLoginCount: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
    /** TOTP secret (base32), encrypted with encryptField. Set when enrollment is confirmed. */
    totpSecretEnc: text(),
    /** A secret shown on /2fa/setup but not yet confirmed with a code. */
    totpPendingSecretEnc: text(),
    totpEnabledAt: timestamp({ withTimezone: true }),
    /** Last accepted TOTP time step: a code can be used once (replay guard, single UPDATE). */
    totpLastCounter: bigint({ mode: "number" }),
    lastLoginAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [check("admins_email_lowercase", sql`${t.email} = lower(${t.email})`)],
);

/** One row per signed-in browser. The cookie holds the raw token; only its SHA-256 is stored. */
export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: id(),
    adminId: uuid()
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique(),
    /** The admin's sessionVersion when the session was created; a bump voids it. */
    sessionVersion: integer().notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    ipHash: text(),
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.adminId, t.revokedAt)],
);

export const adminRecoveryCodes = pgTable(
  "admin_recovery_codes",
  {
    id: id(),
    adminId: uuid()
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    codeHash: text().notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex().on(t.adminId, t.codeHash)],
);

export const adminRoles = pgTable("admin_roles", {
  id: id(),
  key: text().notNull().unique(),
  name: text().notNull(),
  description: text().notNull().default(""),
  /** The built-in super_admin role: every permission, not editable or deletable. */
  isSystem: boolean().notNull().default(false),
  ...timestamps(),
});

export const adminRolePermissions = pgTable(
  "admin_role_permissions",
  {
    roleId: uuid()
      .notNull()
      .references(() => adminRoles.id, { onDelete: "cascade" }),
    permission: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);

export const adminRoleAssignments = pgTable(
  "admin_role_assignments",
  {
    adminId: uuid()
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    roleId: uuid()
      .notNull()
      .references(() => adminRoles.id, { onDelete: "restrict" }),
    assignedBy: uuid().references(() => admins.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.adminId, t.roleId] }), index().on(t.roleId)],
);

export const adminInvites = pgTable(
  "admin_invites",
  {
    id: id(),
    email: text().notNull(),
    /** SHA-256 of the raw token; the raw token only exists in the emailed link. */
    tokenHash: text().notNull().unique(),
    roleIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    invitedBy: uuid().references(() => admins.id, { onDelete: "set null" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("admin_invites_email_lowercase", sql`${t.email} = lower(${t.email})`),
    // One open invite per address: re-inviting replaces it instead of racing it.
    uniqueIndex("admin_invites_one_open_per_email")
      .on(t.email)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
  ],
);

/** Append-only security log for admin sign-in (mirrors auth_events for creators). */
export const adminAuthEvents = pgTable(
  "admin_auth_events",
  {
    id: id(),
    adminId: uuid().references(() => admins.id, { onDelete: "set null" }),
    type: adminAuthEventType().notNull(),
    ipHash: text(),
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.adminId, t.createdAt)],
);

export type Admin = typeof admins.$inferSelect;
export type AdminSession = typeof adminSessions.$inferSelect;
export type AdminRole = typeof adminRoles.$inferSelect;
export type AdminInvite = typeof adminInvites.$inferSelect;
