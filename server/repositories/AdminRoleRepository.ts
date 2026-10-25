import "server-only";
import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { adminRoleAssignments, adminRolePermissions, adminRoles, admins, type AdminRole } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

/** Roles, their permissions and who holds them. Permission strings are validated by the service. */
export class AdminRoleRepository extends BaseRepository {
  async list(tx?: Executor) {
    const db = this.exec(tx);
    const [roles, perms, counts] = await Promise.all([
      db.select().from(adminRoles).orderBy(sql`${adminRoles.isSystem} desc`, asc(adminRoles.name)),
      db.select().from(adminRolePermissions),
      db
        .select({ roleId: adminRoleAssignments.roleId, n: sql<number>`count(*)::int` })
        .from(adminRoleAssignments)
        .groupBy(adminRoleAssignments.roleId),
    ]);
    return roles.map((role) => ({
      ...role,
      permissions: perms.filter((p) => p.roleId === role.id).map((p) => p.permission),
      members: counts.find((c) => c.roleId === role.id)?.n ?? 0,
    }));
  }

  async findById(id: string, tx?: Executor): Promise<AdminRole | null> {
    const [row] = await this.exec(tx).select().from(adminRoles).where(eq(adminRoles.id, id)).limit(1);
    return row ?? null;
  }

  async findByIds(ids: string[], tx?: Executor): Promise<AdminRole[]> {
    if (!ids.length) return [];
    return this.exec(tx).select().from(adminRoles).where(inArray(adminRoles.id, ids));
  }

  async lockById(id: string, tx: Executor): Promise<AdminRole | null> {
    const [row] = await tx.select().from(adminRoles).where(eq(adminRoles.id, id)).for("update").limit(1);
    return row ?? null;
  }

  /**
   * Locks a role by key. Locking `super_admin` serialises every change that could remove super
   * admin access (unassigning it, suspending a holder), so the "at least one" check can't race.
   */
  async lockByKey(key: string, tx: Executor): Promise<AdminRole | null> {
    const [row] = await tx.select().from(adminRoles).where(eq(adminRoles.key, key)).for("update").limit(1);
    return row ?? null;
  }

  /** Null when the key is taken. */
  async insert(data: Pick<typeof adminRoles.$inferInsert, "key" | "name" | "description">, tx: Executor): Promise<AdminRole | null> {
    const [row] = await tx.insert(adminRoles).values(data).onConflictDoNothing({ target: adminRoles.key }).returning();
    return row ?? null;
  }

  async update(id: string, data: Pick<typeof adminRoles.$inferInsert, "name" | "description">, tx: Executor): Promise<void> {
    await tx.update(adminRoles).set(data).where(eq(adminRoles.id, id));
  }

  async delete(id: string, tx: Executor): Promise<void> {
    await tx.delete(adminRoles).where(eq(adminRoles.id, id));
  }

  async permissionsOf(roleId: string, tx?: Executor): Promise<string[]> {
    const rows = await this.exec(tx).select({ p: adminRolePermissions.permission }).from(adminRolePermissions).where(eq(adminRolePermissions.roleId, roleId));
    return rows.map((r) => r.p);
  }

  /** Replace the role's permissions. Call with the role row locked. */
  async setPermissions(roleId: string, permissions: string[], tx: Executor): Promise<void> {
    await tx.delete(adminRolePermissions).where(eq(adminRolePermissions.roleId, roleId));
    if (permissions.length) await tx.insert(adminRolePermissions).values(permissions.map((permission) => ({ roleId, permission })));
  }

  async memberCount(roleId: string, tx?: Executor): Promise<number> {
    const [row] = await this.exec(tx).select({ n: sql<number>`count(*)::int` }).from(adminRoleAssignments).where(eq(adminRoleAssignments.roleId, roleId));
    return row?.n ?? 0;
  }

  /** The admin's roles and the union of their permissions (one query each, read per request). */
  async grantsFor(adminId: string, tx?: Executor): Promise<{ roles: { id: string; key: string; name: string }[]; permissions: string[] }> {
    const db = this.exec(tx);
    const roles = await db
      .select({ id: adminRoles.id, key: adminRoles.key, name: adminRoles.name })
      .from(adminRoleAssignments)
      .innerJoin(adminRoles, eq(adminRoles.id, adminRoleAssignments.roleId))
      .where(eq(adminRoleAssignments.adminId, adminId))
      .orderBy(asc(adminRoles.name));
    if (!roles.length) return { roles, permissions: [] };
    const perms = await db
      .selectDistinct({ p: adminRolePermissions.permission })
      .from(adminRolePermissions)
      .where(inArray(adminRolePermissions.roleId, roles.map((r) => r.id)));
    return { roles, permissions: perms.map((r) => r.p) };
  }

  /** Every admin's role keys, for the admins list. */
  async roleKeysByAdmin(tx?: Executor): Promise<Map<string, { id: string; key: string; name: string }[]>> {
    const rows = await this.exec(tx)
      .select({ adminId: adminRoleAssignments.adminId, id: adminRoles.id, key: adminRoles.key, name: adminRoles.name })
      .from(adminRoleAssignments)
      .innerJoin(adminRoles, eq(adminRoles.id, adminRoleAssignments.roleId));
    const map = new Map<string, { id: string; key: string; name: string }[]>();
    for (const r of rows) map.set(r.adminId, [...(map.get(r.adminId) ?? []), { id: r.id, key: r.key, name: r.name }]);
    return map;
  }

  /** Make the admin's roles exactly `roleIds`. Call with the admin row locked. */
  async setAssignments(adminId: string, roleIds: string[], assignedBy: string | null, tx: Executor): Promise<void> {
    await tx
      .delete(adminRoleAssignments)
      .where(and(eq(adminRoleAssignments.adminId, adminId), roleIds.length ? notInArray(adminRoleAssignments.roleId, roleIds) : undefined));
    if (roleIds.length) {
      await tx
        .insert(adminRoleAssignments)
        .values(roleIds.map((roleId) => ({ adminId, roleId, assignedBy })))
        .onConflictDoNothing();
    }
  }

  /** Active admins holding super_admin. Call with the super_admin role row locked. */
  async activeSuperAdminIds(tx: Executor): Promise<string[]> {
    const rows = await tx
      .select({ id: admins.id })
      .from(adminRoleAssignments)
      .innerJoin(adminRoles, eq(adminRoles.id, adminRoleAssignments.roleId))
      .innerJoin(admins, eq(admins.id, adminRoleAssignments.adminId))
      .where(and(eq(adminRoles.key, "super_admin"), eq(admins.status, "active")));
    return rows.map((r) => r.id);
  }
}
