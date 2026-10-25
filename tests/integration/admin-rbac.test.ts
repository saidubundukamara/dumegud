import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { isAdminPermission, SEEDED_ROLES } from "@/lib/admin-permissions";
import type { EmailMessage } from "@/server/integrations/email";
import { hashPassword } from "@/server/lib/password";
import { hotp, totpCounter } from "@/server/lib/totp";
import { AdminAccountRepository } from "@/server/repositories/AdminAccountRepository";
import { AdminRoleRepository } from "@/server/repositories/AdminRoleRepository";
import { AuditRepository } from "@/server/repositories/AuditRepository";
import { adminActor, type AdminActor } from "@/server/services/actor";
import { AdminAccountService } from "@/server/services/AdminAccountService";
import { AdminAuthService } from "@/server/services/AdminAuthService";
import { AuditService } from "@/server/services/compliance";
import { insertAdmin } from "../fixtures/admins";
import { createTestDb, type TestDb } from "./db";

// Admin accounts, sign-in and RBAC against real SQL: the conditional updates and row locks that
// keep invites, codes, sessions and the last super admin safe under concurrent requests.

let t: TestDb;
let clock: Date;
const sent: EmailMessage[] = [];
const repos = { adminAccounts: new AdminAccountRepository(), adminRoles: new AdminRoleRepository(), audit: new AuditRepository() };
const audit = new AuditService(repos.audit);
const auth = new AdminAuthService({ repos, audit, rateLimit: async () => {}, now: () => clock });
const accounts = new AdminAccountService({
  repos,
  audit,
  email: { send: async (m: EmailMessage) => void sent.push(m) },
  adminBaseUrl: "http://admin.localhost:3000",
  now: () => clock,
});
const ctx = { ip: "198.51.100.7", userAgent: "vitest" };
const PASSWORD = "correct horse battery";

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

beforeEach(async () => {
  clock = new Date("2026-10-25T08:00:00Z");
  sent.length = 0;
  await t.client.exec(`truncate admin_sessions, admin_recovery_codes, admin_invites, admin_auth_events, admin_role_assignments;
    delete from admins; delete from admin_roles where key not in ('super_admin', 'support', 'compliance', 'finance');`);
});

const roleId = async (key: string) => (await repos.adminRoles.list()).find((r) => r.key === key)!.id;
const tick = () => (clock = new Date(clock.getTime() + 30_000));
const codeFor = (secret: string) => hotp(secret, totpCounter(clock));

/** Invite → accept → enroll: a signed-in admin with the given roles. */
async function onboard(by: AdminActor, email: string, roleKeys: string[]) {
  await accounts.invite(by, { email, roleIds: await Promise.all(roleKeys.map(roleId)) });
  const token = /\/invite\/([\w-]+)/.exec(sent.at(-1)!.text)![1]!;
  const pending = await accounts.acceptInvite(token, { name: email, password: PASSWORD });
  const enrollment = (await auth.enrollmentSecret(pending))!;
  const done = (await auth.confirmEnrollment(pending, codeFor(enrollment.secret), ctx))!;
  const session = (await auth.resolveSession(done.token))!;
  return { token: done.token, session, actor: session.actor, recoveryCodes: done.recoveryCodes, secret: enrollment.secret };
}

const settled = async <T,>(ps: Promise<T>[]) => {
  const results = await Promise.allSettled(ps);
  return { ok: results.filter((r) => r.status === "fulfilled" && r.value).length, results };
};

describe("seeded roles", () => {
  it("match the permission catalog in code", async () => {
    const roles = await repos.adminRoles.list();
    expect(roles.map((r) => r.key).sort()).toEqual(["compliance", "finance", "super_admin", "support"]);
    expect(roles.find((r) => r.key === "super_admin")).toMatchObject({ isSystem: true, permissions: [] });
    for (const [key, seed] of Object.entries(SEEDED_ROLES)) {
      const role = roles.find((r) => r.key === key)!;
      expect(role.permissions.sort(), key).toEqual([...seed.permissions].sort());
      expect(role.permissions.every(isAdminPermission)).toBe(true);
    }
  });
});

describe("invite, enrollment and sign-in", () => {
  it("onboards an admin with exactly the invited roles, and the link works once", async () => {
    const root = await insertAdmin("root@dumegud.test", ["super_admin"]);
    const { session, recoveryCodes } = await onboard(root, "fin@dumegud.test", ["finance"]);
    expect(session.actor.roles).toEqual(["finance"]);
    expect(session.actor.permissions.has("payouts.approve")).toBe(true);
    expect(session.actor.permissions.has("kyc.decide")).toBe(false);
    expect(recoveryCodes).toHaveLength(10);

    const token = /\/invite\/([\w-]+)/.exec(sent.at(-1)!.text)![1]!;
    await expect(accounts.acceptInvite(token, { name: "again", password: PASSWORD })).rejects.toMatchObject({ code: "CONFLICT" });
    const actions = (await repos.audit.recent(20)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["admin.invite", "admin.invite_accept", "admin.totp_enrolled"]));
  });

  it("accepts a link once even when two requests race", async () => {
    const root = await insertAdmin("root@dumegud.test", ["super_admin"]);
    await accounts.invite(root, { email: "race@dumegud.test", roleIds: [await roleId("support")] });
    const token = /\/invite\/([\w-]+)/.exec(sent.at(-1)!.text)![1]!;
    const { ok } = await settled([accounts.acceptInvite(token, { name: "A", password: PASSWORD }), accounts.acceptInvite(token, { name: "B", password: PASSWORD })]);
    expect(ok).toBe(1);
    expect((await repos.adminAccounts.list()).filter((a) => a.email === "race@dumegud.test")).toHaveLength(1);
  });

  it("re-inviting replaces the open invite, so only the newest link works", async () => {
    const root = await insertAdmin("root@dumegud.test", ["super_admin"]);
    await accounts.invite(root, { email: "x@dumegud.test", roleIds: [] });
    const first = /\/invite\/([\w-]+)/.exec(sent.at(-1)!.text)![1]!;
    await accounts.invite(root, { email: "x@dumegud.test", roleIds: [] });
    expect(await accounts.openInvite(first)).toBeNull();
    expect((await repos.adminAccounts.listOpenInvites(clock)).filter((i) => i.email === "x@dumegud.test")).toHaveLength(1);
  });

  it("uses each TOTP code and recovery code once, even in parallel; step-up shares the guard", async () => {
    const root = await insertAdmin("root@dumegud.test", ["super_admin"]);
    const { actor, secret, recoveryCodes } = await onboard(root, "s@dumegud.test", ["support"]);
    tick();
    const pending = (await auth.verifyPassword({ email: "s@dumegud.test", password: PASSWORD }, ctx))!;
    expect(pending.needsEnrollment).toBe(false);
    const code = codeFor(secret);
    expect((await settled([auth.verifySecondFactor(pending, code, ctx), auth.verifySecondFactor(pending, code, ctx)])).ok).toBe(1);
    expect(await auth.confirmStepUp(actor, code, ctx)).toBe(false); // the same step again
    tick();
    expect(await auth.confirmStepUp(actor, codeFor(secret), ctx)).toBe(true);

    const recovery = recoveryCodes[0]!;
    expect((await settled([auth.verifySecondFactor(pending, recovery, ctx), auth.verifySecondFactor(pending, recovery.toUpperCase(), ctx)])).ok).toBe(1);
    expect(await repos.adminAccounts.unusedRecoveryCodes(actor.adminId)).toBe(9);
  });

  it("counts parallel failed logins exactly and locks at the threshold", async () => {
    const admin = (await repos.adminAccounts.insert({ email: "lock@dumegud.test", name: "L", passwordHash: await hashPassword(PASSWORD) }))!;
    await Promise.all(Array.from({ length: 10 }, () => auth.verifyPassword({ email: "lock@dumegud.test", password: "wrong password!" }, ctx)));
    const after = (await repos.adminAccounts.findById(admin.id))!;
    expect(after.failedLoginCount).toBe(10);
    expect(after.lockedUntil!.getTime()).toBeGreaterThan(clock.getTime());
    expect(await auth.verifyPassword({ email: "lock@dumegud.test", password: PASSWORD }, ctx)).toBeNull();
  });

  it("revokes sessions at once on suspension, role change and password change", async () => {
    const root = await insertAdmin("root@dumegud.test", ["super_admin"]);
    const a = await onboard(root, "a@dumegud.test", ["support"]);
    await accounts.setRoles(root, a.actor.adminId, [await roleId("finance")]);
    expect(await auth.resolveSession(a.token)).toBeNull();

    const b = await onboard(root, "b@dumegud.test", ["support"]);
    await accounts.setStatus(root, b.actor.adminId, "suspended", "left the team");
    expect(await auth.resolveSession(b.token)).toBeNull();
    tick();
    expect(await auth.verifyPassword({ email: "b@dumegud.test", password: PASSWORD }, ctx)).toBeNull();

    const c = await onboard(root, "c@dumegud.test", ["support"]);
    tick();
    const other = (await auth.verifySecondFactor((await auth.verifyPassword({ email: "c@dumegud.test", password: PASSWORD }, ctx))!, codeFor(c.secret), ctx))!;
    const fresh = await auth.changePassword(c.actor, { currentPassword: PASSWORD, newPassword: "a brand new passphrase" }, ctx);
    expect(await auth.resolveSession(c.token)).toBeNull();
    expect(await auth.resolveSession(other.token)).toBeNull();
    expect(await auth.resolveSession(fresh)).not.toBeNull();
  });

  it("expires idle sessions", async () => {
    const root = await insertAdmin("root@dumegud.test", ["super_admin"]);
    const { token } = await onboard(root, "idle@dumegud.test", ["support"]);
    clock = new Date(clock.getTime() + 31 * 60_000);
    expect(await auth.resolveSession(token)).toBeNull();
  });
});

describe("least privilege", () => {
  it("only grants what you hold, never super admin, and nobody changes their own access", async () => {
    const root = await insertAdmin("root@dumegud.test", ["super_admin"]);
    await accounts.createRole(root, { key: "people", name: "People", description: "", permissions: ["admins.manage", "creators.view", "reports.view"] });
    await accounts.createRole(root, { key: "readers", name: "Readers", description: "", permissions: ["creators.view"] });
    const { actor: manager } = await onboard(root, "m@dumegud.test", ["people"]);

    await expect(accounts.invite(manager, { email: "x@dumegud.test", roleIds: [await roleId("support")] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(accounts.invite(manager, { email: "x@dumegud.test", roleIds: [await roleId("super_admin")] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await accounts.invite(manager, { email: "x@dumegud.test", roleIds: [await roleId("readers")] });
    await expect(accounts.setRoles(manager, manager.adminId, [await roleId("readers")])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(accounts.setStatus(manager, root.adminId, "suspended", "x")).rejects.toMatchObject({ code: "FORBIDDEN" });

    const { actor: support } = await onboard(root, "sup@dumegud.test", ["support"]);
    // Taking a role away is as guarded as granting it.
    await expect(accounts.setRoles(manager, support.adminId, [])).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("role editors can't touch super admin, their own role, or permissions they lack", async () => {
    const root = await insertAdmin("root@dumegud.test", ["super_admin"]);
    await accounts.createRole(root, { key: "editors", name: "Editors", description: "", permissions: ["roles.manage", "creators.view"] });
    const { actor: editor } = await onboard(root, "e@dumegud.test", ["editors"]);

    await expect(accounts.updateRole(editor, await roleId("super_admin"), { name: "x", description: "", permissions: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(accounts.updateRole(editor, await roleId("editors"), { name: "Editors", description: "", permissions: ["roles.manage", "creators.view", "audit.export"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(accounts.createRole(editor, { key: "sneaky", name: "S", description: "", permissions: ["payouts.approve"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(accounts.createRole(root, { key: "bad", name: "B", description: "", permissions: ["not.a.permission"] })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(accounts.deleteRole(root, await roleId("editors"))).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(accounts.deleteRole(root, await roleId("super_admin"))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("always leaves one active super admin, even when two demote each other at once", async () => {
    const a = await insertAdmin("a@dumegud.test", ["super_admin"]);
    const b = await insertAdmin("b@dumegud.test", ["super_admin"]);
    const { ok, results } = await settled([accounts.setRoles(a, b.adminId, []).then(() => true), accounts.setRoles(b, a.adminId, []).then(() => true)]);
    expect(ok).toBe(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
    const supers = await t.client.query(
      `select count(*)::int as n from admin_role_assignments ra join admin_roles r on r.id = ra.role_id join admins ad on ad.id = ra.admin_id
       where r.key = 'super_admin' and ad.status = 'active'`,
    );
    expect((supers.rows[0] as { n: number }).n).toBe(1);

    const survivor = ok && results[0]!.status === "fulfilled" ? a : b;
    const c = await insertAdmin("c@dumegud.test", ["support"]);
    await expect(accounts.setStatus(c, survivor.adminId, "suspended", "x")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(accounts.setStatus(survivor, survivor.adminId, "suspended", "x")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("break-glass recovery", () => {
  it("unlocks a locked-out admin, never yourself", async () => {
    const root = await insertAdmin("root@dumegud.test", ["super_admin"]);
    const { actor } = await onboard(root, "locked@dumegud.test", ["support"]);
    await Promise.all(Array.from({ length: 10 }, () => auth.verifyPassword({ email: "locked@dumegud.test", password: "wrong password!" }, ctx)));
    expect((await accounts.detail(root, actor.adminId)).admin.lockedUntil).not.toBeNull();

    await expect(accounts.unlock(root, root.adminId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(accounts.unlock(actor, root.adminId)).rejects.toMatchObject({ code: "FORBIDDEN" }); // no admins.manage
    await accounts.unlock(root, actor.adminId);
    const after = await accounts.detail(root, actor.adminId);
    expect(after.admin).toMatchObject({ lockedUntil: null, failedLoginCount: 0 });
    expect(await auth.verifyPassword({ email: "locked@dumegud.test", password: PASSWORD }, ctx)).not.toBeNull();
    expect((await repos.audit.recent(5)).map((a) => a.action)).toContain("admin.unlock");
  });

  it("resets two-step sign-in: sessions end, codes go, and the next sign-in enrolls again", async () => {
    const root = await insertAdmin("root@dumegud.test", ["super_admin"]);
    const { actor, token } = await onboard(root, "lost@dumegud.test", ["finance"]);
    await expect(accounts.resetSecondFactor(root, actor.adminId, " ")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(accounts.resetSecondFactor(root, root.adminId, "lost phone")).rejects.toMatchObject({ code: "FORBIDDEN" });

    await accounts.resetSecondFactor(root, actor.adminId, "Lost phone, confirmed on a video call");
    expect(await auth.resolveSession(token)).toBeNull();
    expect(await repos.adminAccounts.unusedRecoveryCodes(actor.adminId)).toBe(0);
    tick();
    const pending = (await auth.verifyPassword({ email: "lost@dumegud.test", password: PASSWORD }, ctx))!;
    expect(pending.needsEnrollment).toBe(true);
    expect((await repos.audit.recent(5)).find((a) => a.action === "admin.reset_2fa")).toMatchObject({ targetId: actor.adminId });
  });

  it("an admin manager without super admin can't reset a super admin's two-step sign-in", async () => {
    await insertAdmin("root@dumegud.test", ["super_admin"]);
    const other = await insertAdmin("root2@dumegud.test", ["super_admin"]);
    const manager = adminActor(crypto.randomUUID(), ["people_ops"], ["admins.manage"]);
    await expect(accounts.resetSecondFactor(manager, other.adminId, "test")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(accounts.unlock(manager, other.adminId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("migration 0020/0021", () => {
  it("moves staff into admins with the same ids and keeps history pointing at them", async () => {
    // Apply everything up to 0019, add staff the old way, then apply the rest.
    const dir = mkdtempSync(join(tmpdir(), "dumegud-mig-"));
    try {
      cpSync("server/db/migrations", dir, { recursive: true });
      const journal = JSON.parse(readFileSync(join(dir, "meta/_journal.json"), "utf8"));
      journal.entries = journal.entries.filter((e: { idx: number }) => e.idx <= 19);
      writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify(journal));
      const client = new PGlite();
      const db = drizzle({ client, casing: "snake_case" });
      await migrate(db, { migrationsFolder: dir });
      const staffId = crypto.randomUUID();
      const rootId = crypto.randomUUID();
      const formerId = crypto.randomUUID();
      await client.exec(`
        insert into users (id, email, name, password_hash, role) values
          ('${staffId}', 'staff@dumegud.test', 'Staff', 'hash-1', 'staff'),
          ('${rootId}', 'root@dumegud.test', 'Root', null, 'super_admin'),
          ('${formerId}', 'former@dumegud.test', 'Former', 'hash-3', 'creator');
        update risk_rules set updated_by = '${formerId}' where code = (select code from risk_rules limit 1);
        update platform_settings set updated_by = '${staffId}' where key = (select key from platform_settings limit 1);`);
      await migrate(db, { migrationsFolder: "server/db/migrations" });

      const { rows: admins } = await client.query<{ id: string; status: string; password_hash: string }>("select id, status, password_hash from admins order by email");
      expect(admins).toEqual([
        { id: formerId, status: "disabled", password_hash: "!" },
        { id: rootId, status: "active", password_hash: "!" },
        { id: staffId, status: "active", password_hash: "hash-1" },
      ]);
      const { rows: roles } = await client.query<{ admin_id: string; key: string }>(
        "select ra.admin_id, r.key from admin_role_assignments ra join admin_roles r on r.id = ra.role_id order by r.key",
      );
      expect(roles.filter((r) => r.admin_id === staffId).map((r) => r.key)).toEqual(["compliance", "finance", "support"]);
      expect(roles.filter((r) => r.admin_id === rootId).map((r) => r.key)).toEqual(["super_admin"]);
      const { rows: users } = await client.query<{ email: string }>("select email from users");
      expect(users.map((u) => u.email)).toEqual(["former@dumegud.test"]); // staff left users; the demoted one is still a creator
      const { rows: cols } = await client.query("select 1 from information_schema.columns where table_name = 'users' and column_name = 'role'");
      expect(cols).toHaveLength(0);
      await client.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
