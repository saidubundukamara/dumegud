import { revalidateTag } from "next/cache";
import { getMonimeWebhookSecret } from "@/server/env";
import { parseMonimeEvent, verifyMonimeSignature } from "@/server/integrations/monime/webhook";
import { logger } from "@/server/lib/logger";
import { services } from "@/server/services";

// The single Monime webhook URL (register it on the final canonical host: a redirected POST is
// a lost webhook). Authenticated by HMAC signature, so it's exempt from the same-origin check.
// 200 = done or permanently rejected; 500 = transient, Monime retries.

const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  const raw = await request.text(); // raw body BEFORE parsing: the signature covers these bytes
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  const check = verifyMonimeSignature(raw, request.headers.get("monime-signature"), getMonimeWebhookSecret());
  if (!check.ok) {
    logger.warn("monime webhook: rejected signature", { reason: check.reason });
    return new Response("invalid signature", { status: 401 });
  }

  const event = parseMonimeEvent(raw);
  if (!event) {
    // Signed but unparseable: retrying won't help.
    logger.error("monime webhook: malformed envelope");
    return new Response("malformed event", { status: 400 });
  }

  try {
    const outcome = await services.webhooks.handleMonime(event, JSON.parse(raw));
    for (const tag of outcome.revalidate) revalidateTag(tag, "max");
    return new Response(null, { status: outcome.response === "retry" ? 500 : 200 });
  } catch (err) {
    // Database unavailable or similar: let Monime retry.
    logger.error("monime webhook: unexpected error", { eventId: event.event.id, err });
    return new Response(null, { status: 500 });
  }
}
