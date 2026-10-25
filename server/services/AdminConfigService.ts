import "server-only";
import { z } from "zod";
import type { Category, LimitAction, LimitScope, LimitWindow, TransactionLimit } from "@/server/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { isUniqueViolation } from "@/server/repositories/BaseRepository";
import type { CategoryRepository } from "@/server/repositories/CategoryRepository";
import type { PlatformSettingsRepository } from "@/server/repositories/PlatformSettingsRepository";
import type { RiskRepository } from "@/server/repositories/RiskRepository";
import { assertPermission, type AdminActor } from "./actor";
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

export type CategoryInput = { name: string; slug: string; active: boolean; position: number };

const categorySchema = z.object({
  name: z.string().trim().min(1, "Give the category a name.").max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens, like music-and-audio.")
    .max(60),
  active: z.boolean(),
  position: z.number().int().min(0).max(999),
});

/**
 * Limits and settings edits (PRD §6.2: configured in admin, never hardcoded; audited with
 * before/after). Needs limits.manage / settings.manage. Changes apply immediately: services read them per request.
 */
export class AdminConfigService {
  constructor(
    private readonly repos: { risk: RiskRepository; settings: PlatformSettingsRepository; categories: CategoryRepository },
    private readonly audit: AuditLogger,
    private readonly transaction: typeof runInTransaction = runInTransaction,
  ) {}

  async listLimits(actor: AdminActor) {
    assertPermission(actor, "limits.view");
    return this.repos.risk.allLimits();
  }

  async saveLimit(actor: AdminActor, id: string | null, input: LimitInput): Promise<TransactionLimit> {
    assertPermission(actor, "limits.manage", "You don't have permission to change limits.");
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
        ? (await this.repos.risk.updateLimit(id, { ...input, updatedBy: actor.adminId }, tx))!
        : await this.repos.risk.insertLimit({ ...input, updatedBy: actor.adminId }, tx);
      return { before, saved };
    });
    await this.audit.log({ actor, action: id ? "limit.update" : "limit.create", targetType: "transaction_limit", targetId: saved.id, before, after: saved });
    return saved;
  }

  /**
   * `expectedVersion` is the version the editor saw (0 = not stored yet): if someone saved in the
   * meantime, this edit is refused instead of silently overwriting theirs.
   */
  async updateSetting(actor: AdminActor, key: string, value: unknown, expectedVersion?: number): Promise<number> {
    assertPermission(actor, "settings.manage", "You don't have permission to change settings.");
    const valid = validateSetting(key, value);
    if (!valid.ok) throw new ValidationError(valid.error);
    const { before, version } = await this.transaction(async (tx) => {
      const before = await this.repos.settings.lock(key, tx);
      if (expectedVersion !== undefined && (before?.version ?? 0) !== expectedVersion) {
        throw new ConflictError("Someone else changed this setting since you opened the page. Reload and try again.");
      }
      return { before, version: await this.repos.settings.set(key, valid.value, actor.adminId, tx) };
    });
    await this.audit.log({ actor, action: "setting.update", targetType: "platform_setting", targetId: key, before: before?.value ?? null, after: valid.value });
    return version;
  }

  // ── Categories (creator pages and products pick one) ──────────────────────────

  async listCategories(actor: AdminActor): Promise<Category[]> {
    assertPermission(actor, "settings.view");
    return this.repos.categories.listAll();
  }

  /**
   * Create (id null) or edit a category. Hiding one keeps it on the pages and products that
   * already use it; it just can't be picked any more. Slugs are unique (the constraint decides).
   */
  async saveCategory(actor: AdminActor, id: string | null, input: CategoryInput): Promise<Category> {
    assertPermission(actor, "settings.manage", "You don't have permission to change categories.");
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Check the category.");
    let result: { before: Category | null; saved: Category };
    try {
      result = await this.transaction(async (tx) => {
        const before = id ? await this.repos.categories.lockById(id, tx) : null;
        if (id && !before) throw new NotFoundError();
        const saved = id ? (await this.repos.categories.update(id, parsed.data, tx))! : await this.repos.categories.insert(parsed.data, tx);
        return { before, saved };
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError("Another category already uses that slug.");
      throw err;
    }
    await this.audit.log({ actor, action: id ? "category.update" : "category.create", targetType: "category", targetId: result.saved.id, before: result.before, after: result.saved });
    return result.saved;
  }
}
