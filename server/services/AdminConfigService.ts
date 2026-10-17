import "server-only";
import type { LimitAction, LimitScope, LimitWindow, TransactionLimit } from "@/server/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/lib/errors";
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
    const before = id ? await this.repos.risk.findLimit(id) : null;
    if (id && !before) throw new NotFoundError();
    const saved = id
      ? (await this.repos.risk.updateLimit(id, { ...input, updatedBy: actor.userId }))!
      : await this.repos.risk.insertLimit({ ...input, updatedBy: actor.userId });
    await this.audit.log({ actor, action: id ? "limit.update" : "limit.create", targetType: "transaction_limit", targetId: saved.id, before, after: saved });
    return saved;
  }

  async updateSetting(actor: Actor, key: string, value: unknown): Promise<number> {
    this.superAdmin(actor);
    const valid = validateSetting(key, value);
    if (!valid.ok) throw new ValidationError(valid.error);
    const before = await this.repos.settings.get(key);
    const version = await this.transaction((tx) => this.repos.settings.set(key, valid.value, actor.userId, tx));
    await this.audit.log({ actor, action: "setting.update", targetType: "platform_setting", targetId: key, before: before?.value ?? null, after: valid.value });
    return version;
  }

  private superAdmin(actor: Actor) {
    if (actor.role !== "super_admin") throw new ForbiddenError("Only a super admin can change limits and settings.");
  }
}
