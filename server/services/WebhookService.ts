import "server-only";
import type { MonimeEvent } from "@/server/integrations/monime/webhook";
import { logger } from "@/server/lib/logger";
import type { WebhookEventRepository } from "@/server/repositories/WebhookEventRepository";

// Single, idempotent entry point for every Monime event. Each event type maps to one handler;
// Phase 4 registers settlement (checkout/payment events) and Phase 6 payouts. Event types
// without a handler are recorded as `ignored` (and logged at warn: ib4me silently dropped
// `payout.completed` for months this way).

export type WebhookHandlerResult = {
  status: "processed" | "ignored";
  /** Cache tags (internal ids only) the route should revalidate after success. */
  revalidate?: string[];
};

/** Must be idempotent and order-independent: events can be redelivered and arrive in any order. */
export type WebhookHandler = (event: MonimeEvent) => Promise<WebhookHandlerResult>;

/** The thing the event refers to isn't there *yet* (e.g. its row is mid-transaction). Monime should retry. */
export class WebhookRetryLater extends Error {
  name = "WebhookRetryLater";
}

/** The event can never be applied (unknown reference, impossible state). Stop retries and alert staff. */
export class WebhookRejected extends Error {
  name = "WebhookRejected";
}

/** `retry` → HTTP 500 so the provider redelivers; `ok` → HTTP 200. */
export type WebhookOutcome = { response: "ok" | "retry"; revalidate: string[] };

/** After this many deliveries, a RetryLater becomes permanent (dead + alert). */
export const MAX_WEBHOOK_ATTEMPTS = 8;
/**
 * A `processing` claim older than this is assumed to have crashed and can be reclaimed. Kept
 * above the maximum function duration (300s on Vercel) so a slow-but-alive request is never
 * overtaken. Handlers must still be idempotent (state-machine guards): a reclaim can overlap.
 */
export const STALE_CLAIM_MS = 10 * 60_000;

export class WebhookService {
  private readonly now: () => Date;

  constructor(
    private readonly events: WebhookEventRepository,
    private readonly handlers: Partial<Record<string, WebhookHandler>>,
    opts: { now?: () => Date } = {},
  ) {
    this.now = opts.now ?? (() => new Date());
  }

  async handleMonime(event: MonimeEvent, payload: unknown): Promise<WebhookOutcome> {
    const claim = await this.events.claim(
      {
        provider: "monime",
        providerEventId: event.event.id,
        eventName: event.event.name,
        objectType: event.object?.type ?? null,
        objectId: event.object?.id ?? null,
        payload,
      },
      this.now(),
      STALE_CLAIM_MS,
    );

    if (!claim.claimed) {
      // Duplicate delivery. If another request is still working on it, ask for a retry so a
      // crash there doesn't lose the event; otherwise it's done (or dead) and 200 is right.
      return { response: claim.status === "processing" ? "retry" : "ok", revalidate: [] };
    }

    const fields = { eventId: event.event.id, eventName: event.event.name, attempt: claim.attempts };
    const handler = this.handlers[event.event.name];
    if (!handler) {
      logger.warn("monime webhook: no handler for event type; recorded as ignored", fields);
      await this.events.finish(claim.id, "ignored", this.now());
      return { response: "ok", revalidate: [] };
    }

    try {
      const result = await handler(event);
      await this.events.finish(claim.id, result.status, this.now());
      return { response: "ok", revalidate: result.revalidate ?? [] };
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 500) : "unknown error";
      const permanent =
        err instanceof WebhookRejected || (err instanceof WebhookRetryLater && claim.attempts >= MAX_WEBHOOK_ATTEMPTS);
      if (permanent) {
        // Phase 7 turns this into an admin alert row.
        logger.error("monime webhook: permanently failed; needs staff attention", { ...fields, err });
        await this.events.finish(claim.id, "dead", this.now(), message);
        return { response: "ok", revalidate: [] };
      }
      logger.warn("monime webhook: failed; provider will retry", { ...fields, err });
      await this.events.finish(claim.id, "failed", this.now(), message);
      return { response: "retry", revalidate: [] };
    }
  }
}
