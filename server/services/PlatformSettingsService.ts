import "server-only";
import { z } from "zod";
import { logger } from "@/server/lib/logger";
import type { PlatformSettingsRepository } from "@/server/repositories/PlatformSettingsRepository";

const bps = z.number().int().min(0).max(10_000);
const minorAmount = z.number().int().positive();

const SCHEMA = {
  "fees.contributionBps": bps,
  "fees.productBps": bps,
  "fees.monimeCollectionBpsEstimate": bps,
  "amounts.minContribution": minorAmount,
  "amounts.maxContribution": minorAmount,
  "products.minPrice": minorAmount,
  "products.maxPrice": minorAmount,
  "uploads.maxBytes": z.number().int().positive().max(2 * 1024 ** 3),
  "uploads.allowedTypes": z.array(z.string().regex(/^[a-z0-9]{1,8}$/)).min(1),
  "downloads.defaultLimit": z.number().int().min(1).max(100),
  "downloads.accessDays": z.number().int().min(1).max(3650),
  "fees.monimePayoutBpsEstimate": bps,
  "payouts.min": minorAmount,
  "payouts.autoApproveMax": minorAmount,
  "payouts.killSwitch": z.boolean(),
  "payoutMethods.firstCooldownHours": z.number().int().min(0).max(720),
  "payoutMethods.changeCooldownHours": z.number().int().min(0).max(720),
  "kyc.nameMatchEnforced": z.boolean(),
  "phone.operatorPrefixes": z.object({ m17: z.array(z.string().regex(/^\d{2}$/)), m18: z.array(z.string().regex(/^\d{2}$/)) }),
  "risk.dualApprovalMinBalance": minorAmount,
  "payouts.dualApprovalMin": minorAmount,
  "jobs.ledgerDriftToleranceMinor": z.number().int().min(0),
} as const;

export type SettingKey = keyof typeof SCHEMA;
export const SETTING_KEYS = Object.keys(SCHEMA) as SettingKey[];

/** Validate a value for a key (admin editor). Returns the parsed value or an error message. */
export function validateSetting(key: string, value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (!(key in SCHEMA)) return { ok: false, error: "Unknown setting." };
  const parsed = SCHEMA[key as SettingKey].safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid value." };
}

/** Used when a key is missing or invalid in the database. Placeholders until pricing is approved. */
const DEFAULTS: { [K in keyof typeof SCHEMA]: z.infer<(typeof SCHEMA)[K]> } = {
  "fees.contributionBps": 300,
  "fees.productBps": 500,
  "fees.monimeCollectionBpsEstimate": 100,
  "amounts.minContribution": 1000,
  "amounts.maxContribution": 50000,
  "products.minPrice": 500,
  "products.maxPrice": 500000,
  "uploads.maxBytes": 200 * 1024 * 1024,
  "uploads.allowedTypes": ["pdf", "epub", "mp3", "wav", "zip", "png", "jpg", "webp"],
  "downloads.defaultLimit": 5,
  "downloads.accessDays": 30,
  "fees.monimePayoutBpsEstimate": 100,
  "payouts.min": 5000,
  "payouts.autoApproveMax": 100000,
  "payouts.killSwitch": false,
  "payoutMethods.firstCooldownHours": 24,
  "payoutMethods.changeCooldownHours": 48,
  "kyc.nameMatchEnforced": true,
  "phone.operatorPrefixes": { m17: ["72", "73", "74", "75", "76", "78", "79"], m18: ["30", "33", "34", "77", "80", "88", "99"] },
  "risk.dualApprovalMinBalance": 100000,
  "payouts.dualApprovalMin": 500000,
  "jobs.ledgerDriftToleranceMinor": 100,
};

export type PlatformSettings = {
  contributionFeeBps: number;
  productFeeBps: number;
  monimeCollectionBpsEstimate: number;
  minContributionMinor: number;
  maxContributionMinor: number;
  minProductPriceMinor: number;
  maxProductPriceMinor: number;
  maxUploadBytes: number;
  /** File extensions sellers may upload (lowercase, no dot). */
  allowedUploadTypes: string[];
  defaultDownloadLimit: number;
  defaultAccessDays: number;
  payoutFeeBpsEstimate: number;
  minPayoutMinor: number;
  /** Payouts above this wait for staff release. */
  payoutAutoApproveMaxMinor: number;
  payoutsKillSwitch: boolean;
  firstMethodCooldownHours: number;
  changedMethodCooldownHours: number;
  nameMatchEnforced: boolean;
  operatorPrefixes: { m17: string[]; m18: string[] };
  /** Restricting/restoring a creator owed at least this needs a second staff approval. */
  dualApprovalMinBalanceMinor: number;
  /** Payouts at or above this need two different staff approvals. */
  payoutDualApprovalMinMinor: number;
  /** Ledger vs live Monime balance difference the ledger-drift cron tolerates before alerting. */
  ledgerDriftToleranceMinor: number;
};

/** Typed view over `platform_settings`. Bad values fall back to defaults (and are logged), never crash checkout. */
export class PlatformSettingsService {
  constructor(private readonly repo: PlatformSettingsRepository) {}

  async get(): Promise<PlatformSettings> {
    const rows = await this.repo.all();
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    const read = <K extends keyof typeof SCHEMA>(key: K): (typeof DEFAULTS)[K] => {
      if (!stored.has(key)) return DEFAULTS[key];
      const parsed = SCHEMA[key].safeParse(stored.get(key));
      if (parsed.success) return parsed.data as (typeof DEFAULTS)[K];
      logger.error("invalid platform setting; using default", { key });
      return DEFAULTS[key];
    };
    const settings = {
      contributionFeeBps: read("fees.contributionBps"),
      productFeeBps: read("fees.productBps"),
      monimeCollectionBpsEstimate: read("fees.monimeCollectionBpsEstimate"),
      minContributionMinor: read("amounts.minContribution"),
      maxContributionMinor: read("amounts.maxContribution"),
      minProductPriceMinor: read("products.minPrice"),
      maxProductPriceMinor: read("products.maxPrice"),
      maxUploadBytes: read("uploads.maxBytes"),
      allowedUploadTypes: read("uploads.allowedTypes"),
      defaultDownloadLimit: read("downloads.defaultLimit"),
      defaultAccessDays: read("downloads.accessDays"),
      payoutFeeBpsEstimate: read("fees.monimePayoutBpsEstimate"),
      minPayoutMinor: read("payouts.min"),
      payoutAutoApproveMaxMinor: read("payouts.autoApproveMax"),
      payoutsKillSwitch: read("payouts.killSwitch"),
      firstMethodCooldownHours: read("payoutMethods.firstCooldownHours"),
      changedMethodCooldownHours: read("payoutMethods.changeCooldownHours"),
      nameMatchEnforced: read("kyc.nameMatchEnforced"),
      operatorPrefixes: read("phone.operatorPrefixes"),
      dualApprovalMinBalanceMinor: read("risk.dualApprovalMinBalance"),
      payoutDualApprovalMinMinor: read("payouts.dualApprovalMin"),
      ledgerDriftToleranceMinor: read("jobs.ledgerDriftToleranceMinor"),
    };
    if (settings.minContributionMinor > settings.maxContributionMinor) {
      logger.error("platform settings: min contribution exceeds max; using defaults for both");
      settings.minContributionMinor = DEFAULTS["amounts.minContribution"];
      settings.maxContributionMinor = DEFAULTS["amounts.maxContribution"];
    }
    return settings;
  }
}
