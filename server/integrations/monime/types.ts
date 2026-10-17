// Monime API shapes as used (implementation.md Appendix B). Money is always integer minor units
// of SLE. Response types are deliberately loose where Monime is: fields we don't rely on are
// optional, and fee/failure fields go through the tolerant parsers in ./parse.ts.

export type Money = { currency: "SLE"; value: number };

/** Monime metadata values are strings. Never put PII (names, emails, phones) here. */
export type Metadata = Record<string, string>;

// ── Financial accounts ────────────────────────────────────────────────────────────

export type FinancialAccountRequest = {
  name: string;
  currency: "SLE";
  reference?: string;
  description?: string;
  metadata?: Metadata;
};

export type FinancialAccount = {
  id: string;
  uvan: string;
  name: string;
  currency: string;
  reference?: string | null;
  description?: string | null;
  /** `available` comes as Money, a bare number, or null depending on the endpoint/version. */
  balance?: { available: Money | number | null } | null;
  metadata?: Record<string, unknown> | null;
  createTime?: string;
  updateTime?: string;
};

// ── Checkout sessions & payments ─────────────────────────────────────────────────

export type CheckoutLineItem = {
  type: "custom";
  name: string;
  price: Money;
  quantity: number;
  /** ≤ 100 characters. */
  description?: string;
  reference?: string;
};

export type ProviderOption = { disable: boolean; enabledProviders?: string[]; disabledProviders?: string[] };

export type CheckoutSessionRequest = {
  name: string;
  description?: string;
  successUrl: string;
  cancelUrl: string;
  financialAccountId: string;
  reference?: string;
  lineItems: CheckoutLineItem[];
  metadata?: Metadata;
  callbackState?: string;
  paymentOptions?: { card?: { disable: boolean }; bank?: ProviderOption; momo?: ProviderOption; wallet?: ProviderOption };
};

export type CheckoutSessionStatus = "pending" | "completed" | "failed" | "cancelled" | "expired";

export type CheckoutSession = {
  id: string;
  status: CheckoutSessionStatus;
  redirectUrl?: string;
  name?: string;
  reference?: string | null;
  financialAccountId?: string;
  expireTime?: string;
  createTime?: string;
  metadata?: Record<string, string> | null;
  lineItems?: { data: CheckoutLineItem[] };
};

/** Fees as Monime reports them: documented as an array. Sum with `sumMonimeFees`, never read [0]. */
export type MonimeFee = { amount?: { currency?: string; value?: number } | null; code?: string; metadata?: unknown };

export type Payment = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "refunded";
  amount: Money;
  fees?: MonimeFee[] | null;
  channel?: { type?: string; provider?: string; reference?: string; phoneNumber?: string; fingerprint?: string };
  financialAccountId?: string;
  financialTransactionReference?: string;
  ownershipGraph?: { owner?: { type?: string; id?: string; metadata?: Record<string, unknown> | null } };
  /** Older payloads only; prefer ownershipGraph (see resolveCheckoutSessionId). */
  checkoutSessionId?: string;
  metadata?: Record<string, unknown> | null;
  createTime?: string;
};

// ── Internal transfers ──────────────────────────────────────────────────────────

export type InternalTransferRequest = {
  amount: Money;
  sourceFinancialAccount: { id: string };
  destinationFinancialAccount: { id: string };
  description?: string;
  metadata?: Metadata;
};

export type InternalTransfer = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  amount: Money;
  sourceFinancialAccount: { id: string };
  destinationFinancialAccount: { id: string };
  failureDetail?: FailureDetail | string | null;
  metadata?: Record<string, unknown> | null;
};

// ── Payouts & provider KYC ──────────────────────────────────────────────────────

export type MomoProvider = "m17" | "m18"; // Orange Money, AfriMoney

export type PayoutRequest = {
  /** phoneNumber is `232XXXXXXXX`, no `+`. */
  destination: { type: "momo"; providerId: MomoProvider; phoneNumber: string };
  amount: Money;
  source: { financialAccountId: string };
  metadata?: Metadata;
};

/** Live payouts send an object, e.g. `{ code: "fund_insufficient", message: "…" }`. */
export type FailureDetail = { code?: string | null; message?: string | null };

export type Payout = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  amount: Money;
  /** Charged on top of `amount` to the source account. */
  fees?: MonimeFee[] | null;
  destination?: { type?: string; providerId?: string; phoneNumber?: string; transactionReference?: string };
  source?: { financialAccountId?: string; transactionReference?: string };
  failureDetail?: FailureDetail | string | null;
  metadata?: Record<string, unknown> | null;
};

export type ProviderKyc = {
  account: { id: string; holderName: string; name?: string };
  provider: { id: string; type: string; name: string };
};

// ── Client ──────────────────────────────────────────────────────────────────────

export interface MonimeClient {
  createFinancialAccount(body: FinancialAccountRequest, idempotencyKey: string): Promise<FinancialAccount>;
  getFinancialAccount(id: string): Promise<FinancialAccount>;
  createCheckoutSession(body: CheckoutSessionRequest, idempotencyKey: string): Promise<CheckoutSession>;
  getCheckoutSession(id: string): Promise<CheckoutSession>;
  getPayment(id: string): Promise<Payment>;
  createInternalTransfer(body: InternalTransferRequest, idempotencyKey: string): Promise<InternalTransfer>;
  getInternalTransfer(id: string): Promise<InternalTransfer>;
  createPayout(body: PayoutRequest, idempotencyKey: string): Promise<Payout>;
  getPayout(id: string): Promise<Payout>;
  /** Registered holder name for a mobile-money number. 404 → MonimeApiError(status 404): not registered. */
  getProviderKyc(providerId: MomoProvider, accountId: string): Promise<ProviderKyc>;
}
