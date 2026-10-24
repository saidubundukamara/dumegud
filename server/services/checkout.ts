import "server-only";
import type { Payment } from "@/server/db/schema";
import type { Metadata, MonimeClient } from "@/server/integrations/monime";
import { ConflictError, ExternalServiceError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import type { PaymentRepository } from "@/server/repositories/PaymentRepository";
import type { LimitOutcome, LimitService } from "./LimitService";
import type { Tx } from "./transaction";

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

/**
 * Inside the checkout insert transaction: lock the creator's wallet row (serialising concurrent
 * checkouts for this creator) and run the limit precheck again, now counting every pending
 * checkout. Returns the payment's `reviewHold`. `first` is the early, unlocked result.
 */
export async function recheckLimitsLocked(
  deps: { limits?: Pick<LimitService, "precheck">; wallets: CreatorWalletRepository },
  input: Parameters<LimitService["precheck"]>[0],
  first: LimitOutcome,
  blockedMessage: string,
  tx: Tx,
): Promise<string | null> {
  let outcome = first;
  if (deps.limits) {
    await deps.wallets.lockByUserId(input.creatorId, tx);
    outcome = await deps.limits.precheck(input, tx);
    if (outcome.outcome === "block") throw new ConflictError(blockedMessage);
  }
  return outcome.outcome === "review" ? outcome.breaches.map((b) => `${b.scope}/${b.window}`).join(",") : null;
}
