# DuMeGud running-cost budget

_Estimated in October 2026 for launch with low traffic. Recheck each provider's pricing page before committing, because some figures come from third-party sources._

## Key questions

**Is Cloudflare email $5 per domain?** No. Email Sending is part of the **Workers Paid plan, which costs $5/month per Cloudflare account**. Each account gets 3,000 outbound emails a month, and after that it's $0.35 per 1,000. If dumegud.com is on the same Cloudflare account that already pays for Workers Paid, sending costs **$0 extra**. All domains on that account share the 3,000 emails. R2 is billed to the same account.

**Can we stay on Vercel's free (Hobby) plan?** Yes while we build and test, but not after launch:

1. **Crons:** Hobby only runs crons once a day. `vercel.ts` therefore holds only the daily jobs (`cleanup`, `account-deletions`). The free [cron-job.org](https://cron-job.org) calls the five frequent jobs (`provision-wallets`, `retry-transfers`, `reconcile-payments`, `reconcile-payouts`, `ledger-drift`) with the `CRON_SECRET` header. See `docs/implementation.md` Phase 9.
2. **Terms:** Hobby is for non-commercial use only. DuMeGud takes platform fees on payments, so **we need Vercel Pro ($20/month per team member) before taking real money** (Monime `live`). Pro includes $20 of usage credit, which easily covers launch traffic. On Pro, the five schedules move into `vercel.ts`, with no code changes.

Until launch, Vercel costs $0 and the monthly total below drops by $20.

## Monthly budget

| Item | What it's for | Monthly cost (USD) | Notes |
| --- | --- | --- | --- |
| Domain (dumegud.com) | Site and email sender | **~$1** ($12/yr) | Cloudflare Registrar sells at cost |
| Vercel Pro (1 seat) | Hosting and crons | **$20** | Each extra team member is another $20 |
| Neon Postgres (Launch) | Database | **~$15–25** | Usage-based with no minimum: $0.106 per CU-hour plus $0.35/GB-month. See [Neon and the crons](#neon-and-the-crons) |
| Upstash Redis | Rate limiting | **$0–2** | Free up to 500K commands/month. Add a card for pay-as-you-go ($0.20 per 100K) and set a budget cap |
| Cloudflare Workers Paid | Email sending (and Workers) | **$0 extra** on the existing account, otherwise $5 | 3,000 emails/month included |
| Cloudflare R2 | Avatars, products, KYC documents, uploads | **$0** | Free tier: 10 GB storage, 1M writes and 10M reads a month, no egress fees. Above that, $0.015/GB |
| Cloudflare Email Routing | Forward support@ / hello@ to Gmail | **$0** | Free inbound forwarding, so no Google Workspace mailbox is needed |
| Google sign-in (OAuth) | "Continue with Google" | $0 | |
| Sentry (Phase 10) | Error tracking | $0 | The free Developer plan covers 5K errors a month |
| Monime | Payments and payouts | Per transaction | Transaction fees, not a subscription. They come out of each payment and the platform fee covers them (`PlatformSettingsService`) |

**Total: about $36–48/month**, or about $41–53 if the Cloudflare $5 is on a new account. That's roughly **$430–580 a year**, domain included.

### Neon and the crons

Neon only charges for compute while the database is awake, and it suspends after 5 idle minutes. Crons every 5 minutes keep it from ever suspending, so it runs all month. At the smallest size (0.25 CU), that's about 182 CU-hours, or about **$19/month**. Storage at launch (under 1 GB) adds a few cents.

Neon's Free plan can't keep the database awake all month, and its backup history is very short. A payments app should be on Launch for point-in-time restore.

There are two ways to keep this cost down:

- **Cap compute:** set Neon's max autoscale to 0.25 CU so it never runs at a bigger size. The figures above already assume this.
- **Run crons less often:** running them every 15–30 minutes during quiet hours lets the database suspend between runs and brings the cost to about $5–10.

## Optional and later costs (not in the total)

- **Extra Vercel seats:** $20/month for each collaborator who deploys.
- **Upstash fixed plan:** $10/month, only if traffic grows past a few million commands a month.
- **More email:** above 3,000/month, about $0.35 per 1,000. At 20K emails a month that adds about $6.
- **Business email inbox** (Google Workspace, about $7/user/month): only if we want to _reply_ as `support@dumegud.com` instead of forwarding.
- **Vercel usage above the $20 credit:** unlikely in the first months.

## Action items

1. Add dumegud.com to the Cloudflare account that already has Workers Paid. Use it for the registrar, DNS, R2, Email Routing and sending.
2. Set up the five cron-job.org jobs once Phase 9 is deployed, and upgrade Vercel to Pro before going live.
3. Create a Neon Launch project with max compute 0.25 CU.
4. Create an Upstash database, add a card and set a monthly budget cap (e.g. $5).
5. Recheck prices on vercel.com/pricing, neon.com/pricing, upstash.com/pricing and Cloudflare's Email Service pricing page.

## Sources

- [Cloudflare Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
- [Vercel cron usage & pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Vercel limits](https://vercel.com/docs/limits)
- [Neon pricing review 2026](https://www.jetadmin.io/blog/neon-review/)
- [Upstash Redis pricing](https://upstash.com/pricing/redis)
