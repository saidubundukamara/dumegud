import "server-only";
import { computeSplit, estimateMonimeFee } from "@/lib/fees";
import type { Payment as PaymentRow, PaymentStatus } from "@/server/db/schema";
import type { paymentKind } from "@/server/db/schema/payments";
import {
  resolveCheckoutSessionId,
  sumMonimeFees,
  type CheckoutSession,
  type MonimeClient,
  type Payment as MonimePayment,
} from "@/server/integrations/monime";
import { unwrapResult } from "@/server/integrations/monime/client";
import type { MonimeEvent } from "@/server/integrations/monime/webhook";
import { creatorTag } from "@/server/lib/cache-tags";
import { pepperedHash } from "@/server/lib/hash";
import { logger } from "@/server/lib/logger";
import type { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import type { LedgerRepository } from "@/server/repositories/LedgerRepository";
import type { EventInfo, PaymentPatch, PaymentRepository } from "@/server/repositories/PaymentRepository";
import { settleJournal, varianceJournal } from "./ledger";
import { ALLOWED_FROM, TERMINAL_UNPAID } from "./payment-state";
import type { PlatformSettingsService } from "./PlatformSettingsService";
import { runInTransaction, type Tx } from "./transaction";
import type { TransferService } from "./TransferService";
import { WebhookRetryLater, type WebhookHandler, type WebhookHandlerResult } from "./WebhookService";

type Ref = { sessionId?: string | null; paymentId?: string | null };

type SettlementRepos = { payments: PaymentRepository; ledger: LedgerRepository; profiles: CreatorProfileRepository };

/**
 * What a payment kind does when it succeeds. `onSucceeded` runs inside the same transaction as
 * the succeeded transition (so e.g. an order's entitlement exists iff the payment succeeded);
 * `afterSucceeded` runs after commit, on every delivery, and must be idempotent (receipts).
 */
export type Fulfilment = {
  onSucceeded(payment: PaymentRow, tx: Tx): Promise<void>;
  afterSucceeded?(payment: PaymentRow): Promise<void>;
};

export type SettlementServiceDeps = {
  repos: SettlementRepos;
  fulfilment?: Partial<Record<(typeof paymentKind.enumValues)[number], Fulfilment>>;
  transfers: Pick<TransferService, "settleToCreator">;
  settings: Pick<PlatformSettingsService, "get">;
  monime: MonimeClient;
  now?: () => Date;
  transaction?: typeof runInTransaction;
};

/** Supporter-facing status: never reveals review/risk detail. */
export type PublicPaymentStatus = "processing" | "succeeded" | "failed";

/** How long the success page waits for webhooks before asking Monime directly. */
export const POLL_FALLBACK_AFTER_MS = 20_000;

const TERMINAL_EVENTS: Record<string, PaymentStatus> = {
  "checkout_session.failed": "failed",
  "checkout_session.cancelled": "canceled",
  "checkout_session.expired": "expired",
  "payment.failed": "failed",
};

/**
 * Applies Monime's verdicts to payments (implementation.md Phase 4). Every entry point is
 * idempotent and order-independent: `checkout_session.completed` (no fees) and
 * `payment.processing_completed` (fees) can arrive in either order, any number of times.
 * The row lock (SELECT … FOR UPDATE) serialises concurrent deliveries for one payment.
 *
 * - The split is computed once, from the first known fee, and posted to the ledger as
 *   `settle:{paymentId}`. A fee is never overwritten (and never coerced to 0 when absent).
 * - A reported fee that disagrees with an earlier estimate becomes a variance the platform absorbs.
 * - The transfer to the creator starts as soon as the payment is succeeded *and* split.
 * - Money that arrives for a payment we had given up on goes to `under_review`, never ignored.
 */
export class SettlementService {
  private readonly repos: SettlementRepos;
  private readonly transfers: SettlementServiceDeps["transfers"];
  private readonly settings: SettlementServiceDeps["settings"];
  private readonly monime: MonimeClient;
  private readonly now: () => Date;
  private readonly transaction: typeof runInTransaction;
  private readonly fulfilment: NonNullable<SettlementServiceDeps["fulfilment"]>;

  constructor(deps: SettlementServiceDeps) {
    this.repos = deps.repos;
    this.fulfilment = deps.fulfilment ?? {};
    this.transfers = deps.transfers;
    this.settings = deps.settings;
    this.monime = deps.monime;
    this.now = deps.now ?? (() => new Date());
    this.transaction = deps.transaction ?? runInTransaction;
  }

  /** Webhook handlers to register with WebhookService. */
  webhookHandlers(): Record<string, WebhookHandler> {
    const completed: WebhookHandler = (e) => this.onPaymentCompleted(e);
    const terminal: WebhookHandler = (e) => this.onTerminal(e);
    return {
      "checkout_session.completed": (e) => this.onCheckoutCompleted(e),
      "payment.processing_completed": completed,
      "payment.completed": completed, // legacy name; same handler
      "checkout_session.failed": terminal,
      "checkout_session.cancelled": terminal,
      "checkout_session.expired": terminal,
      "payment.failed": terminal,
    };
  }

  // ── Events ────────────────────────────────────────────────────────────────────

  async onCheckoutCompleted(event: MonimeEvent): Promise<WebhookHandlerResult> {
    const session = unwrapResult<CheckoutSession>(event.data);
    const ref = { sessionId: session.id ?? event.object?.id, paymentId: session.metadata?.paymentId };
    return this.markSucceeded(ref, { source: "webhook", providerEventId: event.event.id });
  }

  async onPaymentCompleted(event: MonimeEvent): Promise<WebhookHandlerResult> {
    const data = unwrapResult<MonimePayment>(event.data);
    const ref = { sessionId: resolveCheckoutSessionId(data), paymentId: stringOrNull(data.metadata?.paymentId) };
    if (!ref.sessionId && !ref.paymentId) {
      logger.warn("payment event without a checkout session; not ours", { eventId: event.event.id });
      return { status: "ignored" };
    }
    const reportedFee = sumMonimeFees(data.fees); // null = not reported (never 0)
    const info: EventInfo = { source: "webhook", providerEventId: event.event.id };

    const result = await this.transaction(async (tx) => {
      const payment = await this.lock(ref, tx);
      let current = payment;

      // References: first writer wins; a different spm on the same payment is suspicious.
      if (!payment.monimePaymentId) {
        current =
          (await this.repos.payments.update(
            payment.id,
            {
              monimePaymentId: data.id,
              financialTransactionReference: data.financialTransactionReference ?? null,
              channelReference: data.channel?.reference ?? null,
              channelProvider: data.channel?.provider ?? null,
              payerFingerprintHash: payerFingerprint(data),
            },
            tx,
          )) ?? payment;
      } else if (payment.monimePaymentId !== data.id) {
        logger.error("second Monime payment for one checkout; needs review", { paymentId: payment.id });
      }

      const amountOk = data.amount?.value === payment.grossMinor && (data.amount?.currency ?? "SLE") === payment.currency;
      if (!amountOk) {
        logger.error("Monime amount differs from the payment; holding for review", { paymentId: payment.id });
        current = (await this.toReview(current, info, "amount_mismatch", tx)) ?? current;
      } else {
        current = (await this.toSucceeded(current, info, tx)) ?? current;
      }

      if (reportedFee !== null) current = await this.applyReportedFee(current, reportedFee, data.id, tx);
      return current;
    });

    return this.afterChange(result);
  }

  async onTerminal(event: MonimeEvent): Promise<WebhookHandlerResult> {
    const to = TERMINAL_EVENTS[event.event.name];
    const data = unwrapResult<CheckoutSession & MonimePayment>(event.data);
    const ref = event.event.name.startsWith("payment.")
      ? { sessionId: resolveCheckoutSessionId(data), paymentId: stringOrNull(data.metadata?.paymentId) }
      : { sessionId: data.id ?? event.object?.id, paymentId: stringOrNull(data.metadata?.paymentId) };
    await this.transaction(async (tx) => {
      const payment = await this.lock(ref, tx);
      const moved = await this.repos.payments.transition(
        payment.id,
        ALLOWED_FROM[to].filter((s) => s === "created" || s === "pending"),
        to,
        { source: "webhook", providerEventId: event.event.id },
        {},
        tx,
      );
      if (!moved) logger.info("terminal event ignored: payment already moved on", { paymentId: payment.id, status: payment.status, to });
    });
    return { status: "processed" };
  }

  // ── Poll fallback & cron ──────────────────────────────────────────────────────

  /** What the success page may show. Falls back to asking Monime if webhooks are slow. */
  async getPublicStatus(paymentId: string): Promise<PublicPaymentStatus | null> {
    let payment = await this.repos.payments.findById(paymentId);
    if (!payment) return null;
    const waitedLongEnough = this.now().getTime() - payment.updatedAt.getTime() >= POLL_FALLBACK_AFTER_MS;
    if ((payment.status === "pending" || payment.status === "created") && payment.monimeCheckoutSessionId && waitedLongEnough) {
      await this.pollCheckout(payment).catch((err) => logger.warn("checkout poll failed", { paymentId, err }));
      payment = (await this.repos.payments.findById(paymentId)) ?? payment;
    }
    if (payment.status === "succeeded" || payment.status === "reversed") return "succeeded";
    if (TERMINAL_UNPAID.includes(payment.status)) return "failed";
    return "processing";
  }

  /**
   * Phase 9 cron: payments that succeeded but never got a reported fee within the grace period
   * settle on the estimate (flagged `estimated`); a later reported fee becomes a variance.
   */
  async settleWithEstimate(paymentId: string): Promise<void> {
    const { monimeCollectionBpsEstimate } = await this.settings.get();
    const result = await this.transaction(async (tx) => {
      const payment = await this.repos.payments.lockById(paymentId, tx);
      if (!payment || payment.status !== "succeeded" || payment.monimeFeeMinor !== null) return null;
      logger.warn("settling on an estimated Monime fee", { paymentId });
      return this.writeSplit(payment, estimateMonimeFee(payment.grossMinor, monimeCollectionBpsEstimate), "estimated", tx);
    });
    if (result) await this.startTransfer(result.id);
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  private async markSucceeded(ref: Ref, info: EventInfo): Promise<WebhookHandlerResult> {
    const result = await this.transaction(async (tx) => {
      const payment = await this.lock(ref, tx);
      return (await this.toSucceeded(payment, info, tx)) ?? payment;
    });
    return this.afterChange(result);
  }

  private async pollCheckout(payment: PaymentRow): Promise<void> {
    const session = await this.monime.getCheckoutSession(payment.monimeCheckoutSessionId!);
    const info: EventInfo = { source: "poll", detail: { sessionStatus: session.status } };
    if (session.status === "completed") {
      // Fee unknown here (polled reads carry no fees): the webhook or the estimate cron sets it.
      await this.markSucceeded({ paymentId: payment.id }, info);
    } else if (session.status === "failed" || session.status === "cancelled" || session.status === "expired") {
      const to: PaymentStatus = session.status === "cancelled" ? "canceled" : session.status;
      await this.repos.payments.transition(payment.id, ["created", "pending"], to, info);
    }
  }

  private async lock(ref: Ref, tx: Tx): Promise<PaymentRow> {
    const payment =
      (ref.sessionId ? await this.repos.payments.lockBySessionId(ref.sessionId, tx) : null) ??
      (ref.paymentId && isUuid(ref.paymentId) ? await this.repos.payments.lockById(ref.paymentId, tx) : null);
    // Usually the checkout row is still being written by the request that started it.
    if (!payment) throw new WebhookRetryLater("payment not found for checkout yet");
    return payment;
  }

  /** created|pending → succeeded; a payment we had given up on → under_review. */
  private async toSucceeded(payment: PaymentRow, info: EventInfo, tx: Tx): Promise<PaymentRow | null> {
    if (TERMINAL_UNPAID.includes(payment.status)) {
      logger.error("money arrived for a payment marked unpaid; holding for review", { paymentId: payment.id, status: payment.status });
      return this.toReview(payment, info, "late_success", tx);
    }
    const succeeded = await this.repos.payments.transition(payment.id, ["created", "pending"], "succeeded", info, { settledAt: this.now() }, tx);
    if (succeeded) await this.fulfilment[succeeded.kind]?.onSucceeded(succeeded, tx);
    return succeeded;
  }

  private toReview(payment: PaymentRow, info: EventInfo, reason: string, tx: Tx) {
    return this.repos.payments.transition(
      payment.id,
      ALLOWED_FROM.under_review,
      "under_review",
      { ...info, detail: { ...info.detail, reason } },
      { settledAt: payment.settledAt ?? this.now() },
      tx,
    );
  }

  private async applyReportedFee(payment: PaymentRow, fee: number, monimePaymentId: string, tx: Tx): Promise<PaymentRow> {
    if (fee > payment.grossMinor) {
      logger.error("reported Monime fee exceeds gross; ignoring it", { paymentId: payment.id });
      return payment;
    }
    if (payment.monimeFeeMinor === null) return this.writeSplit(payment, fee, "reported", tx);

    if (payment.monimeFeeSource === "estimated" && payment.lateReportedFeeMinor === null && fee !== payment.monimeFeeMinor) {
      // The creator keeps the split they were given; the platform absorbs the difference.
      await this.repos.ledger.postJournal(
        varianceJournal({ id: payment.id, monimePaymentId, deltaMinor: fee - payment.monimeFeeMinor }),
        tx,
      );
      return (await this.repos.payments.update(payment.id, { lateReportedFeeMinor: fee }, tx)) ?? payment;
    }
    return payment; // already split on a reported fee: replays change nothing
  }

  /** Record the split once and post the settle journal in the same transaction. */
  private async writeSplit(payment: PaymentRow, fee: number, source: "reported" | "estimated", tx: Tx): Promise<PaymentRow> {
    const split = computeSplit(payment.grossMinor, fee, payment.platformFeeBps);
    const patch: PaymentPatch = {
      monimeFeeMinor: split.monimeFeeMinor,
      monimeFeeSource: source,
      arrivedMinor: split.arrivedMinor,
      platformFeeMinor: split.platformFeeMinor,
      creatorNetMinor: split.creatorNetMinor,
    };
    const updated = (await this.repos.payments.update(payment.id, patch, tx)) ?? { ...payment, ...patch };
    await this.repos.ledger.postJournal(settleJournal({ id: payment.id, creatorId: payment.creatorId, ...split }), tx);
    return updated;
  }

  private async afterChange(payment: PaymentRow): Promise<WebhookHandlerResult> {
    if (payment.status === "succeeded") {
      try {
        await this.fulfilment[payment.kind]?.afterSucceeded?.(payment);
      } catch (err) {
        logger.error("post-success fulfilment failed", { paymentId: payment.id, err });
      }
    }
    if (payment.status === "succeeded" && payment.creatorNetMinor !== null) await this.startTransfer(payment.id);
    const profile = await this.repos.profiles.findByUserId(payment.creatorId);
    return { status: "processed", revalidate: profile ? [creatorTag(profile.id)] : [] };
  }

  /** The transfer has its own retry path; its failure must not fail the webhook. */
  private async startTransfer(paymentId: string): Promise<void> {
    try {
      await this.transfers.settleToCreator(paymentId);
    } catch (err) {
      logger.error("starting the creator transfer threw", { paymentId, err });
    }
  }
}

function payerFingerprint(data: MonimePayment): string | null {
  const source = data.channel?.fingerprint ?? data.channel?.phoneNumber;
  return source ? pepperedHash("payer", source) : null;
}

const stringOrNull = (v: unknown) => (typeof v === "string" && v ? v : null);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
