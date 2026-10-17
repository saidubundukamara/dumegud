import "server-only";
import type { Payment } from "@/server/db/schema";
import type { Metadata, MonimeClient } from "@/server/integrations/monime";
import { ExternalServiceError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { PaymentRepository } from "@/server/repositories/PaymentRepository";

export type CheckoutDeps = { monime: MonimeClient; payments: PaymentRepository; platformAccountId: () => string };

/**
 * Open the Monime checkout for a payment already committed as `created` (contributions and
 * orders share this). Runs outside any transaction. On failure the payment is marked `failed`
 * and a friendly ExternalServiceError is thrown. Returns the hosted-checkout URL.
 */
export async function openCheckout(
  deps: CheckoutDeps,
  payment: Payment,
  opts: {
    name: string;
    lineItemName: string;
    description: string;
    successUrl: string;
    cancelUrl: string;
    /** String values only, no PII. */
    metadata: Metadata;
  },
): Promise<string> {
  let session;
  try {
    session = await deps.monime.createCheckoutSession(
      {
        name: opts.name.slice(0, 64),
        successUrl: opts.successUrl,
        cancelUrl: opts.cancelUrl,
        financialAccountId: deps.platformAccountId(), // platform-first funds flow
        lineItems: [
          {
            type: "custom",
            name: opts.lineItemName.slice(0, 64),
            quantity: 1,
            price: { currency: "SLE", value: payment.grossMinor },
            description: opts.description.slice(0, 100), // Monime's limit
            reference: payment.id,
          },
        ],
        metadata: { ...opts.metadata, paymentId: payment.id },
        callbackState: payment.id,
        paymentOptions: { momo: { disable: false }, card: { disable: true }, bank: { disable: true } },
      },
      `checkout-${payment.id}`,
    );
    if (!session.redirectUrl) throw new Error("checkout session has no redirectUrl");
  } catch (err) {
    const lastError = (err instanceof Error ? err.message : "unknown error").slice(0, 300);
    await deps.payments.transition(payment.id, ["created"], "failed", { source: "app" }, { lastError });
    logger.error("checkout start failed", { paymentId: payment.id, err });
    throw new ExternalServiceError("monime", "We couldn't reach the payment service. Please try again.");
  }

  // Fields first (unguarded), then the guarded status change: a very fast webhook may already
  // have moved the payment past `created`, and that must not be undone.
  await deps.payments.update(payment.id, {
    monimeCheckoutSessionId: session.id,
    checkoutUrl: session.redirectUrl,
    expiresAt: session.expireTime ? new Date(session.expireTime) : null,
  });
  await deps.payments.transition(payment.id, ["created"], "pending", { source: "app" });
  return session.redirectUrl;
}
