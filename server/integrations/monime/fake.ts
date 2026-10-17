import "server-only";
import { randomBytes } from "node:crypto";
import { createMonimeClient } from "./client";
import type {
  CheckoutSession,
  CheckoutSessionRequest,
  FinancialAccount,
  FinancialAccountRequest,
  InternalTransfer,
  InternalTransferRequest,
  MonimeClient,
  MonimeFee,
  Payment,
  Payout,
  PayoutRequest,
} from "./types";

/**
 * In-memory Monime *server* for dev and tests (MONIME_ENVIRONMENT=fake). It sits behind the real
 * HTTP client as its `fetch`, so the client's unwrapping and error parsing run against it.
 *
 * It reproduces the behaviours that caused production bugs in ib4me:
 * - checkout sessions come back double-nested (`{ result: { result: {...} } }`);
 * - errors use the nested `{ success: false, error: { code, message } }` shape;
 * - `fees` is an array with several entries (code that reads `[0]` gets the wrong total);
 * - a completed checkout produces two events, `checkout_session.completed` (no fees) and
 *   `payment.processing_completed` (with fees), in whichever order the test asks for;
 * - zero-value transfers are rejected; payout fees are charged on top of the amount.
 */

export type WebhookEnvelope = {
  apiVersion: string;
  event: { id: string; name: string; timestamp: string };
  object: { id: string; type: string };
  data: Record<string, unknown>;
};

type Account = FinancialAccount & { availableMinor: number };
type StoredResponse = { status: number; body: unknown };

const API_VERSION = "caph.2025-08-23";
const rid = (prefix: string) => `${prefix}-fake${randomBytes(8).toString("hex")}`;
const sle = (value: number) => ({ currency: "SLE" as const, value });

export class FakeMonimeServer {
  readonly accounts = new Map<string, Account>();
  readonly sessions = new Map<string, CheckoutSession>();
  private readonly sessionAmounts = new Map<string, number>();
  readonly payments = new Map<string, Payment>();
  readonly transfers = new Map<string, InternalTransfer>();
  readonly payouts = new Map<string, Payout>();
  private readonly payoutFees = new Map<string, number>();
  /** Registered mobile-money holders: msisdn (232…) → name. */
  readonly kyc = new Map<string, string>();
  private readonly idempotent = new Map<string, StoredResponse>();
  private readonly failures: StoredResponse[] = [];
  /** Every request the client made, for assertions. */
  readonly requests: { method: string; path: string; idempotencyKey: string | null; body: unknown }[] = [];
  /** Payout fee charged on top, in basis points. */
  payoutFeeBps = 100;

  /** The real HTTP client wired to this fake server. */
  client(): MonimeClient {
    return createMonimeClient({
      baseUrl: "https://fake.monime.invalid/v1",
      accessToken: "fake-token",
      spaceId: "spc-fake",
      version: API_VERSION,
      fetch: this.fetch,
    });
  }

  /** Make the next request fail with this HTTP status and Monime error code. */
  failNext(status: number, code = "internal_error", message = "Simulated failure") {
    this.failures.push({ status, body: { success: false, error: { code, message } } });
  }

  /** Create a funded account directly (e.g. the platform account). */
  seedAccount(opts: { id?: string; availableMinor?: number; name?: string } = {}): Account {
    const account = this.newAccount({ name: opts.name ?? "Seeded account", currency: "SLE" }, opts.id);
    account.availableMinor = opts.availableMinor ?? 0;
    return account;
  }

  // ── HTTP surface ────────────────────────────────────────────────────────────

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^.*\/v1/, "");
    const headers = new Headers(init?.headers);
    const key = headers.get("Idempotency-Key");
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    this.requests.push({ method, path, idempotencyKey: key, body });

    const failure = this.failures.shift();
    if (failure) return Response.json(failure.body, { status: failure.status });

    if (method === "POST" && key) {
      const cacheKey = `${path}:${key}`;
      const cached = this.idempotent.get(cacheKey);
      if (cached) return Response.json(cached.body, { status: cached.status });
      const res = this.route(method, path, url, body);
      if (res.status < 500) this.idempotent.set(cacheKey, res);
      return Response.json(res.body, { status: res.status });
    }
    const res = this.route(method, path, url, body);
    return Response.json(res.body, { status: res.status });
  };

  private route(method: string, path: string, url: URL, body: unknown): StoredResponse {
    const [, resource, id] = path.split("/");
    const ok = (result: unknown): StoredResponse => ({ status: 200, body: { success: true, result } });
    const notFound = () => error(404, "not_found", `${resource} not found`);

    switch (`${method} ${resource}${id ? "/:id" : ""}`) {
      case "POST financial-accounts":
        return ok(this.publicAccount(this.newAccount(body as FinancialAccountRequest)));
      case "GET financial-accounts/:id": {
        const account = this.accounts.get(id);
        return account ? ok(this.publicAccount(account)) : notFound();
      }
      case "POST checkout-sessions":
        return this.createSession(body as CheckoutSessionRequest);
      case "GET checkout-sessions/:id": {
        const session = this.sessions.get(id);
        return session ? ok(doubleNest(session)) : notFound();
      }
      case "GET payments/:id": {
        const payment = this.payments.get(id);
        return payment ? ok(payment) : notFound();
      }
      case "POST internal-transfers":
        return this.createTransfer(body as InternalTransferRequest);
      case "GET internal-transfers/:id": {
        const transfer = this.transfers.get(id);
        return transfer ? ok(transfer) : notFound();
      }
      case "POST payouts":
        return this.createPayout(body as PayoutRequest);
      case "GET payouts/:id": {
        const payout = this.payouts.get(id);
        return payout ? ok(payout) : notFound();
      }
      case "GET provider-kyc/:id": {
        const msisdn = url.searchParams.get("accountId") ?? "";
        const holderName = this.kyc.get(msisdn);
        if (!holderName) return notFound();
        return ok({ account: { id: msisdn, holderName }, provider: { id, type: "momo", name: id === "m17" ? "Orange Money" : "AfriMoney" } });
      }
      default:
        return error(404, "not_found", `No fake route for ${method} ${path}`);
    }
  }

  private newAccount(req: FinancialAccountRequest, id = rid("fac")): Account {
    const now = new Date().toISOString();
    const account: Account = {
      id,
      uvan: `FAKE${randomBytes(5).toString("hex").toUpperCase()}`,
      name: req.name,
      currency: req.currency,
      reference: req.reference ?? null,
      description: req.description ?? null,
      metadata: req.metadata ?? null,
      createTime: now,
      updateTime: now,
      availableMinor: 0,
    };
    this.accounts.set(id, account);
    return account;
  }

  private publicAccount(account: Account): FinancialAccount {
    const { availableMinor, ...rest } = account;
    return { ...rest, balance: { available: sle(availableMinor) } };
  }

  private createSession(req: CheckoutSessionRequest): StoredResponse {
    if (!this.accounts.has(req.financialAccountId)) return error(400, "validation_error", "Unknown financialAccountId");
    if (req.lineItems.some((li) => (li.description?.length ?? 0) > 100)) {
      return error(400, "validation_error", "lineItems.description must be at most 100 characters");
    }
    if (Object.values(req.metadata ?? {}).some((v) => typeof v !== "string")) {
      return error(400, "validation_error", "metadata values must be strings");
    }
    const amountMinor = req.lineItems.reduce((sum, li) => sum + li.price.value * li.quantity, 0);
    const id = rid("scs");
    const session: CheckoutSession = {
      id,
      status: "pending",
      name: req.name,
      reference: req.reference ?? null,
      redirectUrl: `https://checkout.fake.monime.invalid/${id}`,
      financialAccountId: req.financialAccountId,
      metadata: req.metadata ?? null,
      lineItems: { data: req.lineItems },
      createTime: new Date().toISOString(),
      expireTime: new Date(Date.now() + 30 * 60_000).toISOString(),
    };
    this.sessions.set(id, session);
    this.sessionAmounts.set(id, amountMinor);
    return { status: 200, body: { success: true, result: doubleNest(session) } };
  }

  private createTransfer(req: InternalTransferRequest): StoredResponse {
    if (!Number.isSafeInteger(req.amount?.value) || req.amount.value <= 0) {
      return error(400, "validation_error", "amount.value must be greater than zero");
    }
    const source = this.accounts.get(req.sourceFinancialAccount.id);
    const destination = this.accounts.get(req.destinationFinancialAccount.id);
    if (!source || !destination) return error(400, "validation_error", "Unknown financial account");
    if (source.availableMinor < req.amount.value) {
      return error(400, "fund_insufficient", "Financial account has insufficient funds.");
    }
    source.availableMinor -= req.amount.value;
    destination.availableMinor += req.amount.value;
    const transfer: InternalTransfer = {
      id: rid("tfr"),
      status: "completed",
      amount: req.amount,
      sourceFinancialAccount: req.sourceFinancialAccount,
      destinationFinancialAccount: req.destinationFinancialAccount,
      metadata: req.metadata ?? null,
      failureDetail: null,
    };
    this.transfers.set(transfer.id, transfer);
    return { status: 200, body: { success: true, result: transfer } };
  }

  private createPayout(req: PayoutRequest): StoredResponse {
    if (!/^232\d{8}$/.test(req.destination?.phoneNumber ?? "")) {
      return error(400, "validation_error", "destination.phoneNumber must be 232XXXXXXXX");
    }
    const source = this.accounts.get(req.source.financialAccountId);
    if (!source) return error(400, "validation_error", "Unknown financial account");
    const feeMinor = Math.floor((req.amount.value * this.payoutFeeBps) / 10_000);
    if (source.availableMinor < req.amount.value + feeMinor) {
      return error(400, "fund_insufficient", "Financial account has insufficient funds.");
    }
    source.availableMinor -= req.amount.value + feeMinor; // fee on top
    const payout: Payout = {
      id: rid("pyt"),
      status: "pending",
      amount: req.amount,
      fees: null,
      destination: { ...req.destination },
      source: { financialAccountId: source.id },
      failureDetail: null,
      metadata: req.metadata ?? null,
    };
    this.payouts.set(payout.id, payout);
    this.payoutFees.set(payout.id, feeMinor);
    return { status: 200, body: { success: true, result: payout } };
  }

  // ── Scenario drivers (return the webhook events Monime would send) ──────────

  /**
   * Pay a pending checkout. Credits the session's account with gross − fees and returns the two
   * events in the requested order. Pass `fees: null` to simulate Monime not reporting fees.
   */
  completeCheckout(
    sessionId: string,
    opts: { order?: "session-first" | "payment-first"; fees?: MonimeFee[] | null; provider?: "m17" | "m18" } = {},
  ): WebhookEnvelope[] {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`fake: unknown session ${sessionId}`);
    if (session.status !== "pending") throw new Error(`fake: session ${sessionId} is ${session.status}`);
    const gross = this.sessionAmounts.get(sessionId)!;
    const fees = opts.fees === undefined ? defaultFees(gross) : opts.fees;
    const feeTotal = (fees ?? []).reduce((sum, f) => sum + (f.amount?.value ?? 0), 0);

    session.status = "completed";
    this.accounts.get(session.financialAccountId!)!.availableMinor += gross - feeTotal;

    const payment: Payment = {
      id: rid("spm"),
      status: "completed",
      amount: sle(gross),
      fees,
      channel: {
        type: "momo",
        provider: opts.provider ?? "m17",
        reference: `MP${randomBytes(4).toString("hex").toUpperCase()}`,
        phoneNumber: "+23276****12",
        fingerprint: randomBytes(8).toString("hex"),
      },
      financialAccountId: session.financialAccountId,
      financialTransactionReference: randomBytes(6).toString("hex"),
      ownershipGraph: { owner: { type: "checkout_session", id: session.id } },
      metadata: session.metadata ?? null,
      createTime: new Date().toISOString(),
    };
    this.payments.set(payment.id, payment);

    const sessionEvent = envelope("checkout_session.completed", { id: session.id, type: "checkout_session" }, session);
    const paymentEvent = envelope("payment.processing_completed", { id: payment.id, type: "payment" }, payment);
    return opts.order === "payment-first" ? [paymentEvent, sessionEvent] : [sessionEvent, paymentEvent];
  }

  /** End a pending checkout without payment. */
  endCheckout(sessionId: string, status: "failed" | "cancelled" | "expired"): WebhookEnvelope {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`fake: unknown session ${sessionId}`);
    session.status = status;
    return envelope(`checkout_session.${status}`, { id: session.id, type: "checkout_session" }, session);
  }

  /** Finish a pending payout. A failure refunds the amount and fee to the source account. */
  settlePayout(payoutId: string, outcome: "completed" | "failed"): WebhookEnvelope {
    const payout = this.payouts.get(payoutId);
    if (!payout) throw new Error(`fake: unknown payout ${payoutId}`);
    const feeMinor = this.payoutFees.get(payoutId)!;
    if (outcome === "completed") {
      payout.status = "completed";
      payout.fees = [{ amount: sle(feeMinor), code: "Base" }];
    } else {
      payout.status = "failed";
      payout.failureDetail = { code: "provider_rejected", message: "The mobile money provider rejected the payout." };
      this.accounts.get(payout.source!.financialAccountId!)!.availableMinor += payout.amount.value + feeMinor;
    }
    return envelope(`payout.${outcome}`, { id: payout.id, type: "payout" }, payout);
  }
}

/** A Monime-shaped event envelope (unsigned). */
export function envelope(name: string, object: { id: string; type: string }, data: object): WebhookEnvelope {
  return {
    apiVersion: API_VERSION,
    event: { id: rid("wkd"), name, timestamp: String(Math.floor(Date.now() / 1000)) },
    object,
    data: JSON.parse(JSON.stringify(data)),
  };
}

/** Two fee lines, as live payments carry: summing them is required to get the real total. */
function defaultFees(gross: number): MonimeFee[] {
  return [
    { amount: sle(Math.floor((gross * 75) / 10_000)), code: "Base", metadata: null },
    { amount: sle(Math.floor((gross * 25) / 10_000)), code: "Processing", metadata: null },
  ];
}

function error(status: number, code: string, message: string): StoredResponse {
  return { status, body: { success: false, error: { code, message } } };
}

/** Live checkout-session responses nest status/metadata/reference under a second `result`. */
function doubleNest(session: CheckoutSession) {
  const { status, metadata, reference, ...outer } = session;
  return { ...outer, result: { status, metadata, reference } };
}

// One shared server per process so dev hot reloads keep the same fake state.
const globalForFake = globalThis as unknown as { __dumegudFakeMonime?: FakeMonimeServer };

export function sharedFakeMonimeServer(): FakeMonimeServer {
  globalForFake.__dumegudFakeMonime ??= new FakeMonimeServer();
  return globalForFake.__dumegudFakeMonime;
}
