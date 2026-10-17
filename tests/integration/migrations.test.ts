import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserRepository } from "@/server/repositories/UserRepository";
import { createTestDb, type TestDb } from "./db";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

describe("migrations", () => {
  it("apply cleanly and seed settings, categories and reserved handles", async () => {
    const { rows: settings } = await t.client.query<{ key: string }>("select key from platform_settings order by key");
    expect(settings.map((r) => r.key)).toContain("fees.contributionBps");
    const { rows: cats } = await t.client.query("select 1 from categories");
    expect(cats.length).toBeGreaterThan(5);
    const { rows: reserved } = await t.client.query("select 1 from reserved_handles where handle = 'dumegud'");
    expect(reserved).toHaveLength(1);
  });

  it("enforce lowercase emails at the database level", async () => {
    const users = new UserRepository();
    await expect(users.insertIfEmailFree({ email: "Mixed@Example.com", name: "x", passwordHash: null })).rejects.toThrow();
    const created = await users.insertIfEmailFree({ email: "a@example.com", name: "x", passwordHash: null });
    expect(created?.email).toBe("a@example.com");
    expect(await users.insertIfEmailFree({ email: "a@example.com", name: "y", passwordHash: null })).toBeNull();
  });
});
