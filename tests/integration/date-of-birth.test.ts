import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { AuthEventRepository } from "@/server/repositories/AuthEventRepository";
import { UserRepository } from "@/server/repositories/UserRepository";
import { createTestDb, type TestDb } from "./db";

let t: TestDb;
const users = new UserRepository();
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

describe("users date of birth", () => {
  it("is required by default for new rows (Google sign-ups) and not for email sign-ups", async () => {
    const google = await users.insertIfEmailFree({ email: "g@example.com", name: "G", passwordHash: null });
    const email = await users.insertIfEmailFree({
      email: "e@example.com",
      name: "E",
      passwordHash: "x",
      dateOfBirthEnc: "enc",
      dateOfBirthRequired: false,
    });
    expect((await users.findAuthState(google!.id))?.needsDateOfBirth).toBe(true);
    expect((await users.findAuthState(email!.id))?.needsDateOfBirth).toBe(false);
  });

  it("setDateOfBirth stores it once and clears the gate", async () => {
    const u = await users.insertIfEmailFree({ email: "once@example.com", name: "O", passwordHash: null });
    expect(await users.setDateOfBirth(u!.id, "first")).toBe(true);
    expect(await users.setDateOfBirth(u!.id, "second")).toBe(false);
    const row = await users.findById(u!.id);
    expect(row).toMatchObject({ dateOfBirthEnc: "first", dateOfBirthRequired: false });
    expect((await users.findAuthState(u!.id))?.needsDateOfBirth).toBe(false);
  });

  it("deletePendingDateOfBirth removes a waiting Google sign-up with its account link and auth events", async () => {
    const u = await users.insertIfEmailFree({ email: "young@example.com", name: "Y", passwordHash: null });
    await t.db.insert(schema.accounts).values({ userId: u!.id, type: "oidc", provider: "google", providerAccountId: "g-1" });
    await new AuthEventRepository().append({ userId: u!.id, type: "google_linked", ipHash: null, userAgent: null });

    expect(await users.deletePendingDateOfBirth(u!.id)).toBe(true);
    expect(await users.findById(u!.id)).toBeNull();
    const { rows } = await t.client.query("select 1 from accounts where provider_account_id = 'g-1'");
    expect(rows).toHaveLength(0);
  });

  it("deletePendingDateOfBirth never touches an account that isn't waiting at the gate", async () => {
    const dated = await users.insertIfEmailFree({ email: "dated@example.com", name: "D", passwordHash: null });
    await users.setDateOfBirth(dated!.id, "enc");
    const legacy = await users.insertIfEmailFree({
      email: "legacy@example.com",
      name: "L",
      passwordHash: "x",
      dateOfBirthRequired: false,
    });
    expect(await users.deletePendingDateOfBirth(dated!.id)).toBe(false);
    expect(await users.deletePendingDateOfBirth(legacy!.id)).toBe(false);
  });
});

describe("migration 0018", () => {
  it("exempts accounts that existed before it", async () => {
    // Apply everything up to 0017, add a user, then apply the rest.
    const dir = mkdtempSync(join(tmpdir(), "dmg-mig-"));
    try {
      cpSync("server/db/migrations", dir, { recursive: true });
      const journalPath = join(dir, "meta/_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8"));
      journal.entries = journal.entries.filter((e: { idx: number }) => e.idx < 18);
      writeFileSync(journalPath, JSON.stringify(journal));

      const client = new PGlite();
      const db = drizzle({ client, schema, casing: "snake_case" });
      await migrate(db, { migrationsFolder: dir });
      await client.query("insert into users (email, name) values ('old@example.com', 'Old')");
      await migrate(db, { migrationsFolder: "server/db/migrations" });

      const { rows } = await client.query<{ date_of_birth_required: boolean }>(
        "select date_of_birth_required from users where email = 'old@example.com'",
      );
      expect(rows[0].date_of_birth_required).toBe(false);
      await client.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
