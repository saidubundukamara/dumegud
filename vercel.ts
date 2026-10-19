import type { VercelConfig } from "@vercel/config/v1";

// Vercel project config (implementation.md Phase 9). Cron routes check `Authorization: Bearer
// $CRON_SECRET`, which Vercel sends automatically. Phase 9 adds the reconciliation jobs here.

export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    // Erase accounts whose 30-day deletion grace period has ended (04:00 UTC = 04:00 in Freetown).
    { path: "/api/cron/account-deletions", schedule: "0 4 * * *" },
  ],
};
