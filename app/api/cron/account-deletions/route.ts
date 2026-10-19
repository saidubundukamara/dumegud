import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { getEnv } from "@/server/env";
import { logger } from "@/server/lib/logger";
import { services } from "@/server/services";

// Daily (vercel.ts): erase accounts whose 30-day deletion grace period has ended.
// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; anything else gets 401.

function authorised(header: string | null): boolean {
  const secret = getEnv().CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorised(request.headers.get("authorization"))) return new Response(null, { status: 401 });
  const result = await services.accountDeletions.eraseDue({ batch: 25 });
  for (const tag of result.tags) revalidateTag(tag, "max");
  logger.info("cron account-deletions", { erased: result.erased, blocked: result.blocked, failed: result.failed });
  return Response.json({ erased: result.erased, blocked: result.blocked, failed: result.failed });
}
