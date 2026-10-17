import { z } from "zod";
import { getEnv, getMonimeWebhookSecret } from "@/server/env";
import { envelope, sharedFakeMonimeServer, type WebhookEnvelope } from "@/server/integrations/monime/fake";
import { signMonimePayload } from "@/server/integrations/monime/webhook";
import { getMonime } from "@/server/services";

// Dev-only webhook simulator. Exists only with MONIME_ENVIRONMENT=fake (which env validation
// refuses on Vercel production); otherwise 404. It drives the in-memory Monime, then signs each
// resulting event and POSTs it to our real webhook route, so the whole pipeline runs.
//
//   curl -X POST localhost:3000/api/dev/monime-webhook -H 'content-type: application/json' \
//     -d '{"action":"create_checkout","amountMinor":5000}'
//   curl … -d '{"action":"complete_checkout","sessionId":"scs-…","order":"payment-first"}'

const fee = z.object({ amount: z.object({ currency: z.literal("SLE"), value: z.number().int().min(0) }), code: z.string() });

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_checkout"), amountMinor: z.number().int().positive(), metadata: z.record(z.string(), z.string()).optional() }),
  z.object({
    action: z.literal("complete_checkout"),
    sessionId: z.string(),
    order: z.enum(["session-first", "payment-first"]).optional(),
    /** Omit for realistic fees; null to simulate Monime not reporting fees. */
    fees: z.array(fee).nullable().optional(),
    /** Deliver each event this many times (idempotency checks). */
    repeat: z.number().int().min(1).max(10).optional(),
  }),
  z.object({ action: z.literal("end_checkout"), sessionId: z.string(), status: z.enum(["failed", "cancelled", "expired"]) }),
  z.object({ action: z.literal("settle_payout"), payoutId: z.string(), outcome: z.enum(["completed", "failed"]) }),
  z.object({
    action: z.literal("raw"),
    name: z.string(),
    object: z.object({ id: z.string(), type: z.string() }).default({ id: "obj-dev", type: "dev" }),
    data: z.record(z.string(), z.unknown()).default({}),
  }),
]);

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  if (env.MONIME_ENVIRONMENT !== "fake") return new Response(null, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  const input = parsed.data;
  const fake = sharedFakeMonimeServer();

  try {
    switch (input.action) {
      case "create_checkout": {
        // A bare checkout into the dev platform account (real ones come from the support widget).
        const platform = fake.accounts.get("fac-dev-platform") ?? fake.seedAccount({ id: "fac-dev-platform", name: "Dev platform" });
        const session = await getMonime().createCheckoutSession(
          {
            name: "Dev checkout",
            successUrl: `${env.APP_BASE_URL}/`,
            cancelUrl: `${env.APP_BASE_URL}/`,
            financialAccountId: platform.id,
            lineItems: [{ type: "custom", name: "Dev support", price: { currency: "SLE", value: input.amountMinor }, quantity: 1 }],
            metadata: input.metadata,
          },
          `dev-checkout-${crypto.randomUUID()}`,
        );
        return Response.json({ session });
      }
      case "complete_checkout":
        return Response.json({
          deliveries: await deliver(fake.completeCheckout(input.sessionId, { order: input.order, fees: input.fees }), input.repeat),
        });
      case "end_checkout":
        return Response.json({ deliveries: await deliver([fake.endCheckout(input.sessionId, input.status)]) });
      case "settle_payout":
        return Response.json({ deliveries: await deliver([fake.settlePayout(input.payoutId, input.outcome)]) });
      case "raw":
        return Response.json({ deliveries: await deliver([envelope(input.name, input.object, input.data)]) });
    }
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

async function deliver(events: WebhookEnvelope[], repeat = 1) {
  const secret = getMonimeWebhookSecret()!;
  const url = `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/api/webhooks/monime`;
  const results: { event: string; name: string; status: number }[] = [];
  for (const event of events) {
    const raw = JSON.stringify(event);
    for (let i = 0; i < repeat; i++) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "monime-signature": signMonimePayload(raw, secret, Math.floor(Date.now() / 1000)) },
        body: raw,
      });
      results.push({ event: event.event.id, name: event.event.name, status: res.status });
    }
  }
  return results;
}
