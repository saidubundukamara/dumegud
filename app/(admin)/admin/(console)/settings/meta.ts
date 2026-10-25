import { parseMajorToMinor } from "@/lib/money";

// How each platform setting is shown and typed in the editor. The service validates the parsed
// value against its own schema; this only turns form input into that value. The kind always
// comes from this table (by key), never from the form.

export type SettingKind = "percent" | "money" | "count" | "hours" | "megabytes" | "toggle" | "json";

export type SettingMeta = { label: string; group: string; kind: SettingKind; hint?: string };

export const SETTING_GROUPS = ["Fees", "Amounts", "Withdrawals", "Products & files", "Identity & phones", "Risk & jobs"] as const;

/** Each group is a tab on the Settings page: its URL slug and what the tab covers. */
export const GROUP_TABS: Record<(typeof SETTING_GROUPS)[number], { slug: string; description: string }> = {
  Fees: { slug: "fees", description: "What DuMeGud keeps from support and product sales, and the Monime fee estimates used when Monime doesn’t report the real fee." },
  Amounts: { slug: "amounts", description: "The smallest and largest amount a supporter can give in one go." },
  Withdrawals: { slug: "withdrawals", description: "The minimum, when a withdrawal needs review or two admins, the waits after a payout number changes, and the switch that pauses every withdrawal." },
  "Products & files": { slug: "products", description: "Product prices, what sellers can upload, and how long buyers can download." },
  "Identity & phones": { slug: "identity", description: "How payout numbers are checked against the creator’s ID and matched to a network." },
  "Risk & jobs": { slug: "risk", description: "When a restriction needs a second admin, and how much ledger drift the hourly check allows." },
};

export const GROUP_SLUGS = SETTING_GROUPS.map((g) => GROUP_TABS[g].slug);

export function groupForSlug(slug: string | undefined): (typeof SETTING_GROUPS)[number] {
  return SETTING_GROUPS.find((g) => GROUP_TABS[g].slug === slug) ?? SETTING_GROUPS[0];
}

export const SETTING_META: Record<string, SettingMeta> = {
  "fees.contributionBps": { group: "Fees", label: "Fee on support", kind: "percent", hint: "Taken from each amount a supporter gives." },
  "fees.productBps": { group: "Fees", label: "Fee on product sales", kind: "percent" },
  "fees.monimeCollectionBpsEstimate": { group: "Fees", label: "Monime collection fee (estimate)", kind: "percent", hint: "Used only when Monime doesn’t report the real fee." },
  "fees.monimePayoutBpsEstimate": { group: "Fees", label: "Monime payout fee (estimate)", kind: "percent", hint: "Charged on top of a withdrawal." },
  "amounts.minContribution": { group: "Amounts", label: "Smallest support amount", kind: "money" },
  "amounts.maxContribution": { group: "Amounts", label: "Largest support amount", kind: "money" },
  "products.minPrice": { group: "Products & files", label: "Lowest product price", kind: "money" },
  "products.maxPrice": { group: "Products & files", label: "Highest product price", kind: "money" },
  "uploads.maxBytes": { group: "Products & files", label: "Largest product file", kind: "megabytes" },
  "uploads.allowedTypes": { group: "Products & files", label: "File types sellers can upload", kind: "json", hint: "A list of extensions, e.g. [\"pdf\", \"mp3\"]." },
  "downloads.defaultLimit": { group: "Products & files", label: "Downloads per purchase", kind: "count" },
  "downloads.accessDays": { group: "Products & files", label: "Days a buyer can download", kind: "count" },
  "payouts.min": { group: "Withdrawals", label: "Smallest withdrawal", kind: "money" },
  "payouts.autoApproveMax": { group: "Withdrawals", label: "Released without review up to", kind: "money", hint: "Larger withdrawals wait in the review queue." },
  "payouts.dualApprovalMin": { group: "Withdrawals", label: "Two approvals from", kind: "money", hint: "Withdrawals this size or more need a second admin." },
  "payouts.killSwitch": { group: "Withdrawals", label: "Pause all withdrawals", kind: "toggle", hint: "Creators can’t withdraw while this is on. Money stays in their wallets." },
  "payoutMethods.firstCooldownHours": { group: "Withdrawals", label: "Wait after adding a first number", kind: "hours" },
  "payoutMethods.changeCooldownHours": { group: "Withdrawals", label: "Wait after changing the number", kind: "hours" },
  "kyc.nameMatchEnforced": { group: "Identity & phones", label: "Payout name must match ID", kind: "toggle" },
  "phone.operatorPrefixes": { group: "Identity & phones", label: "Network prefixes", kind: "json", hint: "Two-digit prefixes per network (m17 Orange Money, m18 AfriMoney)." },
  "risk.dualApprovalMinBalance": { group: "Risk & jobs", label: "Two approvals for restrictions from a balance of", kind: "money" },
  "jobs.ledgerDriftToleranceMinor": { group: "Risk & jobs", label: "Ledger drift tolerance", kind: "money", hint: "Differences up to this amount don’t raise an alert." },
};

export function metaFor(key: string): SettingMeta {
  return SETTING_META[key] ?? { group: "Risk & jobs", label: key, kind: "json" };
}

/** The value as the form shows it. */
export function toInput(kind: SettingKind, value: unknown): string {
  if (value === null || value === undefined) return "";
  switch (kind) {
    case "percent":
      return typeof value === "number" ? (value / 100).toFixed(2) : "";
    case "money":
      return typeof value === "number" ? (value / 100).toFixed(2) : "";
    case "megabytes":
      return typeof value === "number" ? String(Math.round(value / 1024 ** 2)) : "";
    case "count":
    case "hours":
      return String(value);
    case "toggle":
      return value ? "on" : "";
    case "json":
      return JSON.stringify(value);
  }
}

/** Form input → the stored value, or an error message. */
export function fromInput(kind: SettingKind, raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const s = raw.trim();
  switch (kind) {
    case "percent": {
      if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return { ok: false, error: "Enter a percentage like 3 or 2.5." };
      return { ok: true, value: Math.round(Number(s) * 100) };
    }
    case "money": {
      const minor = parseMajorToMinor(s);
      return minor === null ? { ok: false, error: "Enter an amount in leones, like 50 or 12.50." } : { ok: true, value: minor };
    }
    case "megabytes":
      return /^\d{1,5}$/.test(s) ? { ok: true, value: Number(s) * 1024 ** 2 } : { ok: false, error: "Enter a whole number of megabytes." };
    case "count":
    case "hours":
      return /^\d{1,6}$/.test(s) ? { ok: true, value: Number(s) } : { ok: false, error: "Enter a whole number." };
    case "toggle":
      return { ok: true, value: s === "on" };
    case "json":
      try {
        return { ok: true, value: JSON.parse(s) };
      } catch {
        return { ok: false, error: "That isn’t valid JSON. Text goes in double quotes." };
      }
  }
}
