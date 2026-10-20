# Cron jobs setup (cron-job.org)

DuMeGud's background jobs (`docs/implementation.md` Phase 9) catch money that gets stuck:

- payments whose webhook never arrived
- transfers or payouts with no outcome
- creator wallets Monime never created
- ledger drift

Every job is a `GET /api/cron/<job>` route that only runs when the request carries `Authorization: Bearer $CRON_SECRET`. Anything else gets a 401.

On the **Vercel Hobby** plan, Vercel only runs crons once a day. So jobs are split like this:

| Job | Schedule | Triggered by |
| --- | --- | --- |
| `cleanup` | daily 03:30 UTC | Vercel (`vercel.ts`) |
| `account-deletions` | daily 04:00 UTC | Vercel (`vercel.ts`) |
| `provision-wallets` | every 5 min | cron-job.org |
| `retry-transfers` | every 5 min | cron-job.org |
| `reconcile-payments` | every 10 min | cron-job.org |
| `reconcile-payouts` | every 10 min | cron-job.org |
| `ledger-drift` | every hour | cron-job.org |

## Before you start

1. **Apply the database migration** (it creates `job_runs` and `job_leases`):

   ```bash
   DATABASE_URL_MIGRATOR=<neon-migration-url> npm run db:migrate
   ```

2. **Create a cron secret:**

   ```bash
   openssl rand -base64 32
   ```

3. **Add it to Vercel** as `CRON_SECRET` for the Production environment (Project → Settings → Environment Variables), then redeploy. Vercel sends this same secret to the daily jobs automatically.

4. **Check that the route answers.** The first call should return 401 and the second should return 200 with JSON:

   ```bash
   curl -i https://<your-domain>/api/cron/reconcile-payments
   curl -i -H "Authorization: Bearer <CRON_SECRET>" https://<your-domain>/api/cron/reconcile-payments
   ```

## Create the jobs on cron-job.org

Repeat these steps for each of the five jobs in the table below.

1. Go to **Dashboard → Create cronjob**.
2. **Common** tab:
   - **Title**: `DuMeGud <job>`, e.g. `DuMeGud reconcile-payments`
   - **URL**: `https://<your-domain>/api/cron/<job>`
   - **Execution schedule**: from the table below
   - **Enable job**: on
3. **Advanced** tab:
   - **Request method**: `GET`
   - **Headers** → Add: key `Authorization`, value `Bearer <CRON_SECRET>`. Include the word `Bearer` and the space after it.
   - **Timeout**: 30 seconds (each run stops by itself after about 20 seconds)
   - **Treat redirects with HTTP 3xx status code as success**: off
4. **Notifications** tab: turn on **Notify me when an execution fails** and **when the job is disabled automatically**.
5. Save, then press **Test run**. It should return `200` with a body like `{"status":"succeeded","processed":0,"errors":0}`.

| Title | URL path | Schedule |
| --- | --- | --- |
| DuMeGud provision-wallets | `/api/cron/provision-wallets` | Every 5 minutes |
| DuMeGud retry-transfers | `/api/cron/retry-transfers` | Every 5 minutes |
| DuMeGud reconcile-payments | `/api/cron/reconcile-payments` | Every 10 minutes |
| DuMeGud reconcile-payouts | `/api/cron/reconcile-payouts` | Every 10 minutes |
| DuMeGud ledger-drift | `/api/cron/ledger-drift` | Every hour, at minute 0 |

**Saving on Neon before launch:** jobs every 5 minutes keep the Neon database awake all month, which costs about $19/month on its own. While traffic is low, you can set every job to every 15–30 minutes, so the database can suspend between runs. Switch back to the schedules above before launch.

## What the responses mean

| Response | Meaning | Action |
| --- | --- | --- |
| `200` `"status":"succeeded"` | The run finished | None. `errors` > 0 means some rows failed and are retried next run (see Vercel logs) |
| `200` `"status":"skipped"` | The previous run of this job was still going | None. Repeated skips mean runs are overlapping: lengthen the schedule |
| `401` | Missing or wrong secret | Check the header value and that `CRON_SECRET` is set in Vercel and redeployed |
| `500` | The run failed | Check Vercel logs for `job failed`, and the run list on `/admin/webhooks` |
| Timeout | The request took over 30s | Rare: runs stop at about 20s. Check Vercel function logs |

## Monitoring

- **Admin → Webhooks** (`/admin/webhooks`) → **Cron runs** shows the last run of every job. A job is flagged in red when its last run failed or is overdue (older than twice its interval). Below that are the 20 most recent runs.
- **Admin → Overview** shows the count of open **Ledger drift alerts**. Each one is a `LEDGER_DRIFT` risk alert to review in the risk queue.
- cron-job.org emails you when a job fails or is disabled.

## Rotating the secret

1. Generate a new secret and update `CRON_SECRET` in Vercel, then redeploy.
2. Update the `Authorization` header on all five cron-job.org jobs right away. Runs in between get 401s, which is harmless: the next run catches up.

## Moving to Vercel Pro (before taking real money)

Hobby is for non-commercial use only, so upgrade to Pro before Monime goes `live`. Then:

1. Move the five schedules into `vercel.ts` (they're listed in its header comment):

   ```ts
   crons: [
     { path: "/api/cron/provision-wallets", schedule: "*/5 * * * *" },
     { path: "/api/cron/retry-transfers", schedule: "*/5 * * * *" },
     { path: "/api/cron/reconcile-payments", schedule: "*/10 * * * *" },
     { path: "/api/cron/reconcile-payouts", schedule: "*/10 * * * *" },
     { path: "/api/cron/ledger-drift", schedule: "0 * * * *" },
     { path: "/api/cron/cleanup", schedule: "30 3 * * *" },
     { path: "/api/cron/account-deletions", schedule: "0 4 * * *" },
   ],
   ```

2. Deploy, and check on `/admin/webhooks` that the jobs keep running.
3. Delete the cron-job.org jobs and rotate `CRON_SECRET`, since cron-job.org stored the old one.

No code changes are needed. If both schedulers run during the switch, nothing is processed twice: overlapping runs are skipped.
