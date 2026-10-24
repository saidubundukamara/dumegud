import "server-only";
import type {
  CheckoutSession,
  FinancialAccount,
  InternalTransfer,
  MonimeClient,
  Payment,
  Payout,
  ProviderKyc,
} from "./types";

export class MonimeApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MonimeApiError";
  }

  /**
   * Worth retrying later (network, 5xx, rate limit). 4xx validation/auth errors are not. A 409
   * counts as retryable: two concurrent calls with the same idempotency key can conflict while
   * the first is still in flight, so the outcome is unknown and must be re-sent with that key.
   */
  get retryable(): boolean {
    return this.code === "NETWORK_ERROR" || (this.status ?? 0) >= 500 || this.status === 429 || this.status === 409;
  }
}

export type MonimeConfig = {
  baseUrl: string;
  accessToken: string;
  spaceId: string;
  version: string;
  fetch?: typeof fetch;
};

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Monime wraps results as `{ success, result }`, and some endpoints double-nest
 * (`{ result: { result: {…} } }`). Always unwrap both levels; the inner level wins on conflicts.
 */
export function unwrapResult<T>(body: unknown): T {
  if (!isObject(body)) return body as T;
  const outer = isObject(body.result) ? body.result : body;
  const inner = isObject(outer.result) ? outer.result : null;
  if (!inner) return outer as T;
  const merged: Json = { ...outer, ...inner };
  if (merged.result === outer.result) delete merged.result;
  return merged as T;
}

/** Monime's error bodies: `{ success:false, error:{ code, message } }` or a flat `{ code, message }`. */
export function parseMonimeError(body: unknown, status: number): MonimeApiError {
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const root = isObject(body) ? body : {};
  const nested = isObject(root.error) ? root.error : {};
  const code = text(nested.code) ?? text(root.code) ?? "API_ERROR";
  const message = text(nested.message) ?? text(root.message) ?? text(root.error) ?? `HTTP ${status}`;
  return new MonimeApiError(code, message.slice(0, 300), status);
}

/** Minor units from `balance.available`, whichever shape Monime used. null = not reported. */
export function availableBalanceMinor(account: FinancialAccount): number | null {
  const available = account.balance?.available;
  if (available == null) return null;
  if (typeof available === "number") return available;
  return typeof available.value === "number" ? available.value : null;
}

export function createMonimeClient(config: MonimeConfig): MonimeClient {
  const fetchImpl = config.fetch ?? fetch;
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  async function request<T>(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.accessToken}`,
      "Monime-Space-Id": config.spaceId,
      // Required: without it, version-gated endpoints silently behave differently.
      "Monime-Version": config.version,
      "Content-Type": "application/json",
    };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new MonimeApiError("NETWORK_ERROR", err instanceof Error ? err.message : String(err));
    }

    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) throw parseMonimeError(json, res.status);
    return unwrapResult<T>(json);
  }

  const id = (value: string) => encodeURIComponent(value);

  return {
    createFinancialAccount: (body, key) => request<FinancialAccount>("POST", "/financial-accounts", body, key),
    getFinancialAccount: (accountId) =>
      request<FinancialAccount>("GET", `/financial-accounts/${id(accountId)}?withBalance=true`),
    createCheckoutSession: (body, key) => request<CheckoutSession>("POST", "/checkout-sessions", body, key),
    getCheckoutSession: (sessionId) => request<CheckoutSession>("GET", `/checkout-sessions/${id(sessionId)}`),
    getPayment: (paymentId) => request<Payment>("GET", `/payments/${id(paymentId)}`),
    createInternalTransfer: (body, key) => request<InternalTransfer>("POST", "/internal-transfers", body, key),
    getInternalTransfer: (transferId) => request<InternalTransfer>("GET", `/internal-transfers/${id(transferId)}`),
    createPayout: (body, key) => request<Payout>("POST", "/payouts", body, key),
    getPayout: (payoutId) => request<Payout>("GET", `/payouts/${id(payoutId)}`),
    getProviderKyc: (providerId, accountId) =>
      request<ProviderKyc>("GET", `/provider-kyc/${id(providerId)}?accountId=${encodeURIComponent(accountId)}`),
  };
}
