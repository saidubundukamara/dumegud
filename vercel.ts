import type { VercelConfig } from "@vercel/config/v1";

// Vercel project config (implementation.md Phase 9). Cron routes check `Authorization: Bearer
// $CRON_SECRET`, which Vercel sends automatically.
//
// On the Hobby plan Vercel only runs crons once a day, so only the daily jobs live here. The
// frequent ones are triggered by cron-job.org with the same bearer header:
//   /api/cron/provision-wallets   */5 * * * *
//   /api/cron/retry-transfers     */5 * * * *
//   /api/cron/reconcile-payments  */10 * * * *
//   /api/cron/reconcile-payouts   */10 * * * *
//   /api/cron/ledger-drift        0 * * * *
// On Pro (required before taking real money: Hobby is non-commercial), move them here and
// delete the cron-job.org jobs. No code changes.

export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    // Housekeeping (03:30 UTC = 03:30 in Freetown).
    { path: "/api/cron/cleanup", schedule: "30 3 * * *" },
    // Erase accounts whose 30-day deletion grace period has ended (04:00 UTC = 04:00 in Freetown).
    { path: "/api/cron/account-deletions", schedule: "0 4 * * *" },
    // Milestone sweep: anniversaries, missed webhooks, failed emails (06:30 UTC = 06:30 in Freetown).
    { path: "/api/cron/milestones", schedule: "30 6 * * *" },
    // Last month's recaps and emails (07:00 in Freetown). Daily rather than monthly so a failed
    // 1st is picked up on the 2nd; it does nothing once every recap is built and emailed.
    { path: "/api/cron/recaps", schedule: "0 7 * * *" },
  ],
};
