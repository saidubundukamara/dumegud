import "server-only";
import type { LimitAction, LimitScope, LimitWindow, TransactionLimit } from "@/server/db/schema";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/lib/errors";
import type { PlatformSettingsRepository } from "@/server/repositories/PlatformSettingsRepository";
import type { RiskRepository } from "@/server/repositories/RiskRepository";
import type { Actor } from "./actor";
import type { AuditLogger } from "./compliance";
import { validateSetting } from "./PlatformSettingsService";
import { runInTransaction } from "./transaction";

export type LimitInput = {
  scope: LimitScope;
  window: LimitWindow;
  verificationTier: TransactionLimit["verificationTier"];
  riskTier: TransactionLimit["riskTier"];
  maxAmountMinor: number | null;
  maxCount: number | null;
  action: LimitAction;
  active: boolean;
};

/**
 * Limits and settings edits (PRD §6.2: configured in admin, never hardcoded; audited with
 * before/after). Super-admin only. Changes apply immediately: services read them per request.
 */
export class AdminConfigService {
  constructor(
    private readonly repos: { risk: RiskRepository; settings: PlatformSettingsRepository },
    private readonly audit: AuditLogger,
    private readonly transaction: typeof runInTransaction = runInTransaction,
  ) {}

  async listLimits(actor: Actor) {
    if (actor.role !== "staff" && actor.role !== "super_admin") throw new ForbiddenError();
    return this.repos.risk.allLimits();
  }

  async saveLimit(actor: Actor, id: string | null, input: LimitInput): Promise<TransactionLimit> {
    this.superAdmin(actor);
    if (input.maxAmountMinor === null && input.maxCount === null) throw new ValidationError("Set a maximum amount or count.");
    if (input.scope === "per_contribution" && input.window !== "single") throw new ValidationError("Per-contribution limits use the 'single' window.");
    if (input.scope !== "per_contribution" && input.scope !== "creator_payouts" && input.window === "single") {
      throw new ValidationError("This limit needs a time window.");
    }
    // The audit `before` is read under the row lock, so it is what this edit actually replaced.
    const { before, saved } = await this.transaction(async (tx) => {
      const before = id ? await this.repos.risk.lockLimit(id, tx) : null;
      if (id && !before) throw new NotFoundError();
      const saved = id
        ? (await this.repos.risk.updateLimit(id, { ...input, updatedBy: actor.userId }, tx))!
        : await this.repos.risk.insertLimit({ ...input, updatedBy: actor.userId }, tx);
      return { before, saved };
    });
    await this.audit.log({ actor, action: id ? "limit.update" : "limit.create", targetType: "transaction_limit", targetId: saved.id, before, after: saved });
    return saved;
  }

  /**
   * `expectedVersion` is the version the editor saw (0 = not stored yet): if someone saved in the
   * meantime, this edit is refused instead of silently overwriting theirs.
   */
  async updateSetting(actor: Actor, key: string, value: unknown, expectedVersion?: number): Promise<number> {
    this.superAdmin(actor);
    const valid = validateSetting(key, value);
    if (!valid.ok) throw new ValidationError(valid.error);
    const { before, version } = await this.transaction(async (tx) => {
      const before = await this.repos.settings.lock(key, tx);
      if (expectedVersion !== undefined && (before?.version ?? 0) !== expectedVersion) {
        throw new ConflictError("Someone else changed this setting since you opened the page. Reload and try again.");
      }
      return { before, version: await this.repos.settings.set(key, valid.value, actor.userId, tx) };
    });
    await this.audit.log({ actor, action: "setting.update", targetType: "platform_setting", targetId: key, before: before?.value ?? null, after: valid.value });
    return version;
  }

  private superAdmin(actor: Actor) {
    if (actor.role !== "super_admin") throw new ForbiddenError("Only a super admin can change limits and settings.");
  }
}
