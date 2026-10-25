// Admin RBAC catalog. Permissions are fixed in code (every check names one); roles are rows in
// `admin_roles` that a super admin edits from /roles. The super_admin role is built in: it holds
// every permission implicitly and can't be edited or deleted. No server-only import: the roles
// editor (a client form) renders the catalog.

export const ADMIN_PERMISSIONS = {
  "overview.view": { group: "Overview", label: "See the overview and platform balance" },
  "creators.view": { group: "Creators", label: "Search creators and open their records" },
  "creators.status": { group: "Creators", label: "Restrict, suspend or reactivate accounts" },
  "creators.close": { group: "Creators", label: "Close accounts" },
  "transactions.view": { group: "Transactions", label: "See payments and their timelines" },
  "payments.manage": { group: "Transactions", label: "Release reviewed payments, re-sync, retry transfers" },
  "payouts.view": { group: "Payouts", label: "See withdrawals" },
  "payouts.approve": { group: "Payouts", label: "Approve withdrawals" },
  "payouts.reject": { group: "Payouts", label: "Reject withdrawals" },
  "payouts.operate": { group: "Payouts", label: "Re-send and re-sync withdrawals" },
  "kyc.view": { group: "KYC", label: "See identity submissions and documents" },
  "kyc.decide": { group: "KYC", label: "Approve or reject identity checks" },
  "products.view": { group: "Products", label: "See products waiting for review" },
  "products.review": { group: "Products", label: "Publish or send back products" },
  "reports.view": { group: "Reports", label: "See content reports" },
  "reports.resolve": { group: "Reports", label: "Dismiss reports or take content down" },
  "risk.view": { group: "Risk", label: "See alerts, cases and rules" },
  "risk.cases": { group: "Risk", label: "Open cases, dismiss alerts, decide cases" },
  "risk.rules": { group: "Risk", label: "Change risk rules" },
  "limits.view": { group: "Limits & settings", label: "See transaction limits" },
  "limits.manage": { group: "Limits & settings", label: "Change transaction limits" },
  "settings.view": { group: "Limits & settings", label: "See platform settings" },
  "settings.manage": { group: "Limits & settings", label: "Change platform settings (fees, minimums)" },
  "audit.view": { group: "Audit", label: "Read the audit log" },
  "audit.export": { group: "Audit", label: "Export the audit log" },
  "webhooks.view": { group: "Operations", label: "See webhooks and job runs" },
  "webhooks.replay": { group: "Operations", label: "Replay webhooks" },
  "admins.manage": { group: "Admins", label: "Invite admins, suspend them, assign roles" },
  "roles.manage": { group: "Admins", label: "Create and edit roles" },
} as const satisfies Record<string, { group: string; label: string }>;

export type AdminPermission = keyof typeof ADMIN_PERMISSIONS;

export const ALL_ADMIN_PERMISSIONS = Object.keys(ADMIN_PERMISSIONS) as AdminPermission[];

export function isAdminPermission(value: string): value is AdminPermission {
  return Object.hasOwn(ADMIN_PERMISSIONS, value);
}

export const SUPER_ADMIN_ROLE = "super_admin";

/**
 * Roles seeded by the migration (0020). The three working roles keep what the old `staff` role
 * could do between them; the super-admin-only powers (closing accounts, limits, settings, risk
 * rules, audit export, admin management) stay with super_admin until one is granted explicitly.
 */
export const SEEDED_ROLES: Record<string, { name: string; description: string; permissions: AdminPermission[] }> = {
  support: {
    name: "Support",
    description: "Answers creators: looks things up and handles reports.",
    permissions: ["overview.view", "creators.view", "transactions.view", "payouts.view", "products.view", "reports.view", "reports.resolve"],
  },
  compliance: {
    name: "Compliance",
    description: "Identity checks, product review, risk cases and account restrictions.",
    permissions: [
      "overview.view",
      "creators.view",
      "creators.status",
      "transactions.view",
      "kyc.view",
      "kyc.decide",
      "products.view",
      "products.review",
      "reports.view",
      "reports.resolve",
      "risk.view",
      "risk.cases",
      "limits.view",
      "audit.view",
    ],
  },
  finance: {
    name: "Finance",
    description: "Payments, withdrawals and the Monime operations behind them.",
    permissions: [
      "overview.view",
      "creators.view",
      "transactions.view",
      "payments.manage",
      "payouts.view",
      "payouts.approve",
      "payouts.reject",
      "payouts.operate",
      "webhooks.view",
      "webhooks.replay",
      "limits.view",
      "settings.view",
    ],
  },
};
