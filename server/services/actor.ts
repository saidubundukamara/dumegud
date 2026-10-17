import "server-only";
import type { Role, UserStatus } from "@/server/db/schema";

/** The authenticated caller, as verified against the database by the DAL. Services authorize on this. */
export type Actor = {
  userId: string;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
};

export const STAFF_ROLES = ["staff", "super_admin"] as const satisfies readonly Role[];

export function isStaff(role: Role): boolean {
  return (STAFF_ROLES as readonly Role[]).includes(role);
}

/** Request metadata recorded on security events. Never used for authorization. */
export type RequestContext = { ip: string; userAgent: string | null };
