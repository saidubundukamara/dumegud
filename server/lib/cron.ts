import "server-only";
import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { getEnv } from "@/server/env";
import { logger } from "@/server/lib/logger";
import { services } from "@/server/services";
import type { JobContext, JobResult } from "@/server/services/JobService";

// Cron routes (implementation.md Phase 9). Whoever calls them, Vercel Cron (which sends
// `Authorization: Bearer $CRON_SECRET` itself) or cron-job.org on the Hobby plan (configured to
// send the same header), must present the secret; anything else gets 401.

export function cronAuthorised(header: string | null): boolean {
  const secret = getEnv().CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Check the secret, run the job under its lease, refresh any cached pages it changed. */
export async function runCronRoute(request: Request, name: string, job: (ctx: JobContext) => Promise<JobResult>): Promise<Response> {
  if (!cronAuthorised(request.headers.get("authorization"))) return new Response(null, { status: 401 });
  const outcome = await services.jobs.run(name, job);
  for (const tag of new Set(outcome.tags ?? [])) revalidateTag(tag, "max");
  logger.info(`cron ${name}`, { status: outcome.status, processed: outcome.processed, errors: outcome.errors });
  return Response.json(
    { status: outcome.status, processed: outcome.processed, errors: outcome.errors, ...outcome.detail },
    // A failed run answers 500 so the scheduler's failure alerts fire.
    { status: outcome.status === "failed" ? 500 : 200 },
  );
}
