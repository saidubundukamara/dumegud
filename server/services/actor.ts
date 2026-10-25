import "server-only";
import type { AdminPermission } from "@/lib/admin-permissions";
import type { UserStatus } from "@/server/db/schema";
import { ForbiddenError } from "@/server/lib/errors";

/** A signed-in creator, as verified against the database by the DAL. Services authorize on this. */
export type Actor = {
  userId: string;
  status: UserStatus;
  emailVerified: boolean;
};

/**
 * A signed-in admin (separate `admins` table and session, admin subdomain only). Permissions are
 * read from the database on every request, so a role change applies on the next one.
 */
export type AdminActor = {
  kind: "admin";
  adminId: string;
  /** Role keys, e.g. ["compliance", "finance"]. */
  roles: readonly string[];
  superAdmin: boolean;
  permissions: ReadonlySet<AdminPermission>;
};

export function adminActor(adminId: string, roles: readonly string[], permissions: Iterable<AdminPermission>): AdminActor {
  return { kind: "admin", adminId, roles, superAdmin: roles.includes("super_admin"), permissions: new Set(permissions) };
}

/** super_admin holds every permission implicitly. */
export function can(actor: AdminActor, permission: AdminPermission): boolean {
  return actor.superAdmin || actor.permissions.has(permission);
}

export function assertPermission(actor: AdminActor, permission: AdminPermission, message?: string): void {
  if (actor?.kind !== "admin" || !can(actor, permission)) throw new ForbiddenError(message);
}

/** Request metadata recorded on security events. Never used for authorization. */
export type RequestContext = { ip: string; userAgent: string | null };
