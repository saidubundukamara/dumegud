import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebhookEventStatus } from "@/server/db/schema";
import type { MonimeEvent } from "@/server/integrations/monime/webhook";
import type { ClaimInput, ClaimResult, WebhookEventRepository } from "@/server/repositories/WebhookEventRepository";
import {
  MAX_WEBHOOK_ATTEMPTS,
  STALE_CLAIM_MS,
  WebhookRejected,
  WebhookRetryLater,
  WebhookService,
  type WebhookHandler,
} from "@/server/services/WebhookService";

/** Mirrors WebhookEventRepository.claim's SQL semantics. */
function fakeEvents() {
  const rows = new Map<string, { id: string; status: WebhookEventStatus; attempts: number; claimedAt: Date; lastError?: string }>();
  const repo = {
    async claim(input: ClaimInput, now: Date, staleAfterMs: number): Promise<ClaimResult> {
      const row = rows.get(input.providerEventId);
      if (!row) {
        const fresh = { id: input.providerEventId, status: "processing" as const, attempts: 1, claimedAt: now };
        rows.set(input.providerEventId, fresh);
        return { claimed: true, id: fresh.id, attempts: 1 };
      }
      const stale = row.status === "processing" && row.claimedAt.getTime() < now.getTime() - staleAfterMs;
      if (row.status === "failed" || stale) {
        Object.assign(row, { status: "processing", attempts: row.attempts + 1, claimedAt: now });
        return { claimed: true, id: row.id, attempts: row.attempts };
      }
      return { claimed: false, status: row.status };
    },
    async finish(claim: { id: string; attempts: number }, status: WebhookEventStatus, _now: Date, error?: string) {
      const row = rows.get(claim.id)!;
      if (row.attempts === claim.attempts) Object.assign(row, { status, lastError: error });
    },
  };
  return { rows, repo: repo as unknown as WebhookEventRepository };
}

const event = (name = "payment.processing_completed", id = "wkd-1"): MonimeEvent => ({
  event: { id, name },
  object: { id: "spm-1", type: "payment" },
  data: {},
});

let now: Date;
let events: ReturnType<typeof fakeEvents>;
const service = (handlers: Record<string, WebhookHandler>) => new WebhookService(events.repo, handlers, { now: () => now });

beforeEach(() => {
  now = new Date("2026-10-17T12:00:00Z");
  events = fakeEvents();
});

describe("WebhookService.handleMonime", () => {
  it("applies an event once no matter how many times it is delivered", async () => {
    const handler = vi.fn<WebhookHandler>(async () => ({ status: "processed", revalidate: ["payment:p1"] }));
    const svc = service({ "payment.processing_completed": handler });
    const outcomes = [];
    for (let i = 0; i < 5; i++) outcomes.push(await svc.handleMonime(event(), {}));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(outcomes[0]).toEqual({ response: "ok", revalidate: ["payment:p1"] });
    expect(outcomes.slice(1).every((o) => o.response === "ok" && o.revalidate.length === 0)).toBe(true);
    expect(events.rows.get("wkd-1")?.status).toBe("processed");
  });

  it("records unknown event types as ignored and answers 200", async () => {
    const outcome = await service({}).handleMonime(event("something.new"), {});
    expect(outcome.response).toBe("ok");
    expect(events.rows.get("wkd-1")?.status).toBe("ignored");
  });

  it("asks for a retry on RetryLater, then succeeds on redelivery", async () => {
    let ready = false;
    const svc = service({
      "payment.processing_completed": async () => {
        if (!ready) throw new WebhookRetryLater("payment row not committed yet");
        return { status: "processed" };
      },
    });
    expect((await svc.handleMonime(event(), {})).response).toBe("retry");
    expect(events.rows.get("wkd-1")).toMatchObject({ status: "failed", lastError: "payment row not committed yet" });
    ready = true;
    expect((await svc.handleMonime(event(), {})).response).toBe("ok");
    expect(events.rows.get("wkd-1")).toMatchObject({ status: "processed", attempts: 2 });
  });

  it("treats unexpected errors as transient", async () => {
    const svc = service({ "payment.processing_completed": async () => Promise.reject(new Error("db timeout")) });
    expect((await svc.handleMonime(event(), {})).response).toBe("retry");
    expect(events.rows.get("wkd-1")?.status).toBe("failed");
  });

  it("marks Rejected events dead, answers 200 and never reprocesses them", async () => {
    const handler = vi.fn<WebhookHandler>(async () => {
      throw new WebhookRejected("unknown checkout session");
    });
    const svc = service({ "payment.processing_completed": handler });
    expect((await svc.handleMonime(event(), {})).response).toBe("ok");
    expect((await svc.handleMonime(event(), {})).response).toBe("ok");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(events.rows.get("wkd-1")?.status).toBe("dead");
  });

  it("gives up on RetryLater after the maximum attempts", async () => {
    const svc = service({
      "payment.processing_completed": async () => {
        throw new WebhookRetryLater("still missing");
      },
    });
    for (let i = 1; i < MAX_WEBHOOK_ATTEMPTS; i++) expect((await svc.handleMonime(event(), {})).response).toBe("retry");
    expect((await svc.handleMonime(event(), {})).response).toBe("ok");
    expect(events.rows.get("wkd-1")).toMatchObject({ status: "dead", attempts: MAX_WEBHOOK_ATTEMPTS });
  });

  it("asks a concurrent duplicate to retry, and reclaims a crashed (stale) claim", async () => {
    const releases: (() => void)[] = [];
    const handler = vi.fn<WebhookHandler>(
      () => new Promise((resolve) => releases.push(() => resolve({ status: "processed" }))),
    );
    const svc = service({ "payment.processing_completed": handler });

    const first = svc.handleMonime(event(), {});
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    expect((await svc.handleMonime(event(), {})).response).toBe("retry");

    // The first request "dies": once its claim is stale, a redelivery takes over.
    now = new Date(now.getTime() + STALE_CLAIM_MS + 1);
    const second = svc.handleMonime(event(), {});
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(2));
    releases.forEach((release) => release());
    await Promise.all([first, second]);
    expect(events.rows.get("wkd-1")).toMatchObject({ status: "processed", attempts: 2 });
  });

  it("a slow handler whose claim was taken over can't overwrite the newer outcome", async () => {
    const releases: ((ok: boolean) => void)[] = [];
    const handler = vi.fn<WebhookHandler>(
      () => new Promise((resolve, reject) => releases.push((ok) => (ok ? resolve({ status: "processed" }) : reject(new Error("late failure"))))),
    );
    const svc = service({ "payment.processing_completed": handler });
    const first = svc.handleMonime(event(), {});
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    now = new Date(now.getTime() + STALE_CLAIM_MS + 1);
    const second = svc.handleMonime(event(), {});
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(2));
    releases[1](true); // the takeover succeeds...
    await second;
    releases[0](false); // ...then the original, stale attempt fails
    await first;
    expect(events.rows.get("wkd-1")).toMatchObject({ status: "processed", attempts: 2 });
  });
});
