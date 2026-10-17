import "server-only";
import { and, eq, lt, or, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { webhookEvents, type WebhookEventStatus } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

export type ClaimInput = {
  provider: string;
  providerEventId: string;
  eventName: string;
  objectType: string | null;
  objectId: string | null;
  payload: unknown;
};

export type ClaimResult =
  | { claimed: true; id: string; attempts: number }
  | { claimed: false; status: WebhookEventStatus };

export class WebhookEventRepository extends BaseRepository {
  /**
   * Take exclusive ownership of an event. First delivery inserts it. A redelivery reclaims it
   * only if it previously `failed`, or if a claim went stale (a crash mid-processing).
   * Anything else is reported back so the caller can answer without reprocessing.
   */
  async claim(input: ClaimInput, now: Date, staleAfterMs: number, tx?: Executor): Promise<ClaimResult> {
    const db = this.exec(tx);
    const [inserted] = await db
      .insert(webhookEvents)
      .values({ ...input, status: "processing", attempts: 1, receivedAt: now, claimedAt: now })
      .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.providerEventId] })
      .returning({ id: webhookEvents.id, attempts: webhookEvents.attempts });
    if (inserted) return { claimed: true, ...inserted };

    const match = and(eq(webhookEvents.provider, input.provider), eq(webhookEvents.providerEventId, input.providerEventId));
    const [reclaimed] = await db
      .update(webhookEvents)
      .set({ status: "processing", attempts: sql`${webhookEvents.attempts} + 1`, claimedAt: now, lastError: null })
      .where(
        and(
          match,
          or(
            eq(webhookEvents.status, "failed"),
            and(eq(webhookEvents.status, "processing"), lt(webhookEvents.claimedAt, new Date(now.getTime() - staleAfterMs))),
          ),
        ),
      )
      .returning({ id: webhookEvents.id, attempts: webhookEvents.attempts });
    if (reclaimed) return { claimed: true, ...reclaimed };

    const [existing] = await db.select({ status: webhookEvents.status }).from(webhookEvents).where(match).limit(1);
    return { claimed: false, status: existing?.status ?? "processing" };
  }

  async finish(
    id: string,
    status: Extract<WebhookEventStatus, "processed" | "ignored" | "failed" | "dead">,
    now: Date,
    error?: string,
    tx?: Executor,
  ): Promise<void> {
    await this.exec(tx)
      .update(webhookEvents)
      .set({
        status,
        lastError: error ?? null,
        processedAt: status === "processed" || status === "ignored" ? now : null,
      })
      .where(eq(webhookEvents.id, id));
  }
}
