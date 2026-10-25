import { isAdminPermission, SEEDED_ROLES, type AdminPermission } from "@/lib/admin-permissions";
import { AdminAccountRepository } from "@/server/repositories/AdminAccountRepository";
import { AdminRoleRepository } from "@/server/repositories/AdminRoleRepository";
import { adminActor, type AdminActor } from "@/server/services/actor";
import { runInTransaction } from "@/server/services/transaction";

/** What the old `staff` role could do: the three seeded working roles together (migration 0020). */
export const STAFF_ROLES = ["support", "compliance", "finance"];

/** An admin actor without a database row (for services whose staff paths write no admin FK). */
export function fakeAdmin(roles: string[] = STAFF_ROLES, adminId: string = crypto.randomUUID()): AdminActor {
  const permissions = new Set<AdminPermission>(roles.flatMap((r) => SEEDED_ROLES[r]?.permissions ?? []));
  return adminActor(adminId, roles, permissions);
}

/**
 * A real admin row holding `roleKeys` (seeded roles), as the DAL would see it. Idempotent per
 * email, so suites that truncate creator tables between tests can call it again.
 */
export async function insertAdmin(email: string, roleKeys: string[] = STAFF_ROLES): Promise<AdminActor> {
  const accounts = new AdminAccountRepository();
  const roles = new AdminRoleRepository();
  const admin = (await accounts.insert({ email, name: email, passwordHash: "!" })) ?? (await accounts.findByEmail(email))!;
  const all = await roles.list();
  await runInTransaction((tx) => roles.setAssignments(admin.id, all.filter((r) => roleKeys.includes(r.key)).map((r) => r.id), null, tx));
  const grants = await roles.grantsFor(admin.id);
  return adminActor(admin.id, grants.roles.map((r) => r.key), grants.permissions.filter(isAdminPermission));
}
