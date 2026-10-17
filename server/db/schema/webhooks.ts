import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { id } from "./columns";

/**
 * processing: claimed by a request right now (or crashed mid-way; reclaimable once stale)
 * processed:  a handler applied it
 * ignored:    no handler for this event type (recorded, answered 200)
 * failed:     transient failure, answered 500 so the provider retries; reclaimable
 * dead:       permanent failure, answered 200 and needs staff attention; never reprocessed
 */
export const webhookEventStatus = pgEnum("webhook_event_status", ["processing", "processed", "ignored", "failed", "dead"]);

export type WebhookEventStatus = (typeof webhookEventStatus.enumValues)[number];

/** Durable idempotency + audit log for inbound webhooks. `payload` is append-only. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: id(),
    provider: text().notNull(),
    providerEventId: text().notNull(),
    eventName: text().notNull(),
    objectType: text(),
    objectId: text(),
    status: webhookEventStatus().notNull().default("processing"),
    attempts: integer().notNull().default(1),
    lastError: text(),
    /** Verified body as received (Monime masks phone numbers). Needed for audit and replay. */
    payload: jsonb().notNull(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex().on(t.provider, t.providerEventId),
    index().on(t.status, t.receivedAt),
    index().on(t.objectId),
  ],
);

export type WebhookEvent = typeof webhookEvents.$inferSelect;
