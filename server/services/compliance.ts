import "server-only";
import type { RestrictionFeature } from "@/server/db/schema";
import { ConflictError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { AuditRepository } from "@/server/repositories/AuditRepository";
import type { RiskRepository } from "@/server/repositories/RiskRepository";
import type { Actor, AdminActor } from "./actor";

// Cross-cutting compliance hooks (implementation.md Phase 7) that many services take as
// dependencies. The composition root (services/index.ts) wires the real ones; unit tests
// may omit them.

export type AuditEntry = {
  /** A creator acting on their own account, an admin, or null for system jobs. */
  actor: Pick<Actor, "userId"> | AdminActor | null;
  action: string;
  targetType: string;
  targetId: string | null;
  before?: unknown;
  after?: unknown;
  ipHash?: string | null;
};

export interface AuditLogger {
  log(entry: AuditEntry): Promise<void>;
}

/** Writes `audit_logs` (append-only). A failed audit write fails the operation it describes. */
export class AuditService implements AuditLogger {
  constructor(private readonly repo: AuditRepository) {}

  async log(entry: AuditEntry): Promise<void> {
    const actor = entry.actor;
    const who =
      actor === null
        ? { actorId: null, actorType: null, actorRole: null }
        : "kind" in actor
          ? { actorId: actor.adminId, actorType: "admin", actorRole: actor.roles.join(",") || "none" }
          : { actorId: actor.userId, actorType: "user", actorRole: "creator" };
    await this.repo.append({
      ...who,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      before: (entry.before ?? null) as never,
      after: (entry.after ?? null) as never,
      ipHash: entry.ipHash ?? null,
    });
  }
}

export interface RestrictionGuard {
  /** Throws ConflictError(message) if the user may not use `feature` right now. */
  assertAllowed(userId: string, feature: Exclude<RestrictionFeature, "all">, message: string): Promise<void>;
}

/** Restrictions are human decisions (cases); this only enforces them. */
export class RestrictionService implements RestrictionGuard {
  constructor(
    private readonly repo: RiskRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async isRestricted(userId: string, feature: Exclude<RestrictionFeature, "all">): Promise<boolean> {
    return (await this.repo.activeRestrictions(userId, this.now(), [feature, "all"])).length > 0;
  }

  async assertAllowed(userId: string, feature: Exclude<RestrictionFeature, "all">, message: string): Promise<void> {
    if (await this.isRestricted(userId, feature)) {
      logger.info("restricted action refused", { userId, feature });
      throw new ConflictError(message);
    }
  }
}

export const noAudit: AuditLogger = { log: async () => {} };
export const noRestrictions: RestrictionGuard = { assertAllowed: async () => {} };
