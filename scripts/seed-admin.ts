// Seed a super admin in `admins` (separate from creator accounts): creates the admin, or gives an
// existing one the super_admin role and reactivates it, and writes an audit row. An existing admin
// keeps their password unless they have none yet (a migrated Google-only staff account).
// Authenticator setup happens at their first sign-in on the admin subdomain.
//
//   ADMIN_EMAIL=admin@dumegud.local ADMIN_PASSWORD='at-least-10-chars' npm run db:seed:admin
//
// Break-glass for a super admin who lost their authenticator: ADMIN_RESET_2FA=1 clears it (and
// their sessions and recovery codes), so they enroll again at the next sign-in. For a forgotten
// password: ADMIN_RESET_PASSWORD=1 replaces it with ADMIN_PASSWORD. Both also lift a lockout.
//
// Runs against DATABASE_URL (local Docker or Neon). Runs under the react-server condition so
// `server-only` modules (the shared Argon2 settings) can be imported outside Next.
import { loadEnvConfig } from "@next/env";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { adminBaseUrl } from "@/lib/admin-host";
import * as schema from "@/server/db/schema";
import { hashPassword } from "@/server/lib/password";
import { PASSWORD_MIN } from "@/server/validation/auth";

loadEnvConfig(process.cwd());

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "DuMeGud Admin";
  const reset2fa = process.env.ADMIN_RESET_2FA === "1";
  const resetPassword = process.env.ADMIN_RESET_PASSWORD === "1";
  if (!email || !email.includes("@")) throw new Error("Set ADMIN_EMAIL");
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL");
  if (resetPassword && !password) throw new Error("ADMIN_RESET_PASSWORD=1 needs ADMIN_PASSWORD");
  if (password !== undefined && password.length < PASSWORD_MIN) throw new Error(`ADMIN_PASSWORD needs at least ${PASSWORD_MIN} characters`);
  const passwordHash = password ? await hashPassword(password) : null;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool, schema, casing: "snake_case" });
  try {
    const result = await db.transaction(async (tx) => {
      // Same lock order as AdminAccountService: the super_admin role row, then the admin row.
      const [role] = await tx.select().from(schema.adminRoles).where(eq(schema.adminRoles.key, "super_admin")).for("update");
      if (!role) throw new Error("The super_admin role is missing: run npm run db:migrate first");
      const audit = (targetId: string, before: unknown, after: unknown) =>
        tx.insert(schema.auditLogs).values({ actorType: null, actorRole: "seed", action: "admin.seed", targetType: "admin", targetId, before, after });

      const [existing] = await tx.select().from(schema.admins).where(eq(schema.admins.email, email)).for("update");
      if (!existing) {
        if (!passwordHash) throw new Error(`Set ADMIN_PASSWORD (at least ${PASSWORD_MIN} characters) to create a new admin`);
        const [created] = await tx.insert(schema.admins).values({ name, email, passwordHash }).returning({ id: schema.admins.id });
        await tx.insert(schema.adminRoleAssignments).values({ adminId: created!.id, roleId: role.id });
        await audit(created!.id, null, { roles: ["super_admin"] });
        return { adminId: created!.id, outcome: "created" };
      }

      const changes: string[] = [];
      await tx.insert(schema.adminRoleAssignments).values({ adminId: existing.id, roleId: role.id }).onConflictDoNothing();
      const set: Partial<typeof schema.admins.$inferInsert> = {};
      if (existing.status !== "active") {
        set.status = "active";
        changes.push(`reactivated (was ${existing.status})`);
      }
      if (existing.passwordHash === "!" || resetPassword) {
        if (!passwordHash) throw new Error("This admin has no password yet: set ADMIN_PASSWORD");
        Object.assign(set, { passwordHash, failedLoginCount: 0, lockedUntil: null });
        changes.push(existing.passwordHash === "!" ? "password set" : "password reset");
      }
      if (reset2fa) {
        Object.assign(set, { totpSecretEnc: null, totpPendingSecretEnc: null, totpEnabledAt: null, totpLastCounter: null, failedLoginCount: 0, lockedUntil: null });
        await tx.delete(schema.adminRecoveryCodes).where(eq(schema.adminRecoveryCodes.adminId, existing.id));
        changes.push("authenticator reset");
      }
      if (Object.keys(set).length) {
        // Any change here revokes their sessions (session_version bump).
        await tx.update(schema.admins).set({ ...set, sessionVersion: sql`${schema.admins.sessionVersion} + 1` }).where(eq(schema.admins.id, existing.id));
      }
      await audit(existing.id, { status: existing.status }, { roles: ["super_admin"], changes });
      return { adminId: existing.id, outcome: changes.length ? changes.join(", ") : "already a super admin" };
    });
    console.log(`${email}: ${result.outcome} (${result.adminId}). Sign in at ${adminBaseUrl()}/login`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
