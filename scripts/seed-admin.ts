// Seed a super_admin: creates the account (email verified) or promotes an existing one, and
// writes a `user.role` audit row. An existing account keeps its password.
//
//   ADMIN_EMAIL=admin@dumegud.local ADMIN_PASSWORD='at-least-10-chars' npm run db:seed:admin
//
// Runs against DATABASE_URL (local Docker or Neon). Runs under the react-server condition so
// `server-only` modules (the shared Argon2 settings) can be imported outside Next.
import { loadEnvConfig } from "@next/env";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/server/db/schema";
import { hashPassword } from "@/server/lib/password";
import { PASSWORD_MIN } from "@/server/validation/auth";

loadEnvConfig(process.cwd());

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "DuMeGud Admin";
  if (!email || !email.includes("@")) throw new Error("Set ADMIN_EMAIL");
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool, schema, casing: "snake_case" });
  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(schema.users).where(eq(schema.users.email, email)).for("update");
      if (existing) {
        if (existing.role === "super_admin") return { userId: existing.id, outcome: "already a super_admin" };
        await tx
          .update(schema.users)
          .set({ role: "super_admin", status: "active", emailVerified: existing.emailVerified ?? new Date() })
          .where(eq(schema.users.id, existing.id));
        await tx.insert(schema.auditLogs).values({
          actorRole: "seed",
          action: "user.role",
          targetType: "user",
          targetId: existing.id,
          before: { role: existing.role },
          after: { role: "super_admin" },
        });
        return { userId: existing.id, outcome: `promoted from ${existing.role}` };
      }

      if (!password || password.length < PASSWORD_MIN) {
        throw new Error(`Set ADMIN_PASSWORD (at least ${PASSWORD_MIN} characters) to create a new admin`);
      }
      const [created] = await tx
        .insert(schema.users)
        .values({ name, email, emailVerified: new Date(), passwordHash: await hashPassword(password), role: "super_admin", dateOfBirthRequired: false })
        .returning({ id: schema.users.id });
      await tx.insert(schema.auditLogs).values({
        actorRole: "seed",
        action: "user.role",
        targetType: "user",
        targetId: created.id,
        before: null,
        after: { role: "super_admin" },
      });
      return { userId: created.id, outcome: "created" };
    });
    console.log(`${email}: ${result.outcome} (${result.userId})`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
