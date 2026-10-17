import { describe, expect, it } from "vitest";
import { availableBalanceMinor, MonimeApiError } from "@/server/integrations/monime/client";
import { FakeMonimeServer } from "@/server/integrations/monime/fake";
import { describeMonimeFailure, resolveCheckoutSessionId, sumMonimeFees } from "@/server/integrations/monime/parse";
import type { Payment } from "@/server/integrations/monime/types";

const sle = (value: number) => ({ currency: "SLE" as const, value });

async function setup() {
  const server = new FakeMonimeServer();
  const monime = server.client();
  const platform = server.seedAccount({ id: "fac-platform" });
  const creator = await monime.createFinancialAccount({ name: "c", currency: "SLE" }, "creator-wallet-u1");
  return { server, monime, platform, creator };
}

describe("sumMonimeFees", () => {
  it("sums every entry (never [0]) and keeps null distinct from 0", () => {
    expect(sumMonimeFees([{ amount: sle(225) }, { amount: sle(75) }])).toBe(300);
    expect(sumMonimeFees([{ amount: sle(0) }])).toBe(0);
    expect(sumMonimeFees([])).toBeNull();
    expect(sumMonimeFees(null)).toBeNull();
    expect(sumMonimeFees(undefined)).toBeNull();
    expect(sumMonimeFees([{ amount: null }])).toBeNull();
    expect(sumMonimeFees({ total: 300 })).toBe(300);
  });
});

describe("resolveCheckoutSessionId / describeMonimeFailure", () => {
  it("reads ownershipGraph.owner first", () => {
    const p = { ownershipGraph: { owner: { type: "checkout_session", id: "scs-1" } }, checkoutSessionId: "scs-old" } as Payment;
    expect(resolveCheckoutSessionId(p)).toBe("scs-1");
    expect(resolveCheckoutSessionId({ ownershipGraph: { owner: { type: "payment_code", id: "pmc-1" } } })).toBeNull();
    expect(resolveCheckoutSessionId({ checkoutSessionId: "scs-old" })).toBe("scs-old");
  });

  it("describes object, string and missing failures", () => {
    expect(describeMonimeFailure({ failureDetail: { code: "fund_insufficient", message: "No funds." } })).toBe("No funds. (fund_insufficient)");
    expect(describeMonimeFailure({ failureDetail: "boom" })).toBe("boom");
    expect(describeMonimeFailure(null, "Payout failed")).toBe("Payout failed");
  });
});

describe("FakeMonimeServer through the real client", () => {
  it("double-nests checkout sessions, and the client unwraps status and metadata", async () => {
    const { server, monime, platform } = await setup();
    const created = await monime.createCheckoutSession(
      {
        name: "Support",
        successUrl: "https://x/s",
        cancelUrl: "https://x/c",
        financialAccountId: platform.id,
        lineItems: [{ type: "custom", name: "Support", price: sle(5000), quantity: 1 }],
        metadata: { paymentId: "p1" },
      },
      "checkout-p1",
    );
    expect(created).toMatchObject({ status: "pending", metadata: { paymentId: "p1" } });
    expect(created).not.toHaveProperty("result");
    expect(created.redirectUrl).toMatch(/^https:/);

    server.completeCheckout(created.id);
    expect((await monime.getCheckoutSession(created.id)).status).toBe("completed");
  });

  it("emits both settlement events, fees only on the payment, in either order", async () => {
    const { server, monime, platform } = await setup();
    const session = await monime.createCheckoutSession(
      { name: "s", successUrl: "https://x", cancelUrl: "https://x", financialAccountId: platform.id, lineItems: [{ type: "custom", name: "n", price: sle(30000), quantity: 1 }] },
      "k",
    );
    const events = server.completeCheckout(session.id, { order: "payment-first" });
    expect(events.map((e) => e.event.name)).toEqual(["payment.processing_completed", "checkout_session.completed"]);

    const payment = events[0].data as Payment;
    expect(payment.fees).toHaveLength(2); // reading [0] would under-count
    expect(sumMonimeFees(payment.fees)).toBe(300);
    expect(resolveCheckoutSessionId(payment)).toBe(session.id);
    expect(events[1].data).not.toHaveProperty("fees");

    // gross − fees landed in the platform account
    expect(availableBalanceMinor(await monime.getFinancialAccount(platform.id))).toBe(29700);
  });

  it("can simulate Monime not reporting fees", async () => {
    const { server, monime, platform } = await setup();
    const session = await monime.createCheckoutSession(
      { name: "s", successUrl: "https://x", cancelUrl: "https://x", financialAccountId: platform.id, lineItems: [{ type: "custom", name: "n", price: sle(1000), quantity: 1 }] },
      "k",
    );
    const [, paymentEvent] = server.completeCheckout(session.id, { fees: null });
    expect(sumMonimeFees((paymentEvent.data as Payment).fees)).toBeNull();
  });

  it("rejects line-item descriptions over 100 characters and non-string metadata", async () => {
    const { monime, platform } = await setup();
    const base = { name: "s", successUrl: "https://x", cancelUrl: "https://x", financialAccountId: platform.id };
    await expect(
      monime.createCheckoutSession({ ...base, lineItems: [{ type: "custom", name: "n", price: sle(1), quantity: 1, description: "x".repeat(101) }] }, "a"),
    ).rejects.toMatchObject({ code: "validation_error", status: 400 });
  });

  it("rejects zero-value transfers and overdrafts with Monime's nested error shape", async () => {
    const { monime, platform, creator } = await setup();
    const transfer = (value: number, key: string) =>
      monime.createInternalTransfer({ amount: sle(value), sourceFinancialAccount: { id: platform.id }, destinationFinancialAccount: { id: creator.id } }, key);
    await expect(transfer(0, "t0")).rejects.toMatchObject({ code: "validation_error", retryable: false });
    await expect(transfer(100, "t1")).rejects.toMatchObject({ code: "fund_insufficient" });
  });

  it("replays POSTs with the same idempotency key", async () => {
    const { server, monime, platform, creator } = await setup();
    platform.availableMinor = 10_000;
    const body = { amount: sle(4000), sourceFinancialAccount: { id: platform.id }, destinationFinancialAccount: { id: creator.id } };
    const a = await monime.createInternalTransfer(body, "transfer-p1");
    const b = await monime.createInternalTransfer(body, "transfer-p1");
    expect(b.id).toBe(a.id);
    expect(server.accounts.get(platform.id)!.availableMinor).toBe(6000);
  });

  it("charges the payout fee on top and refunds it on failure", async () => {
    const { server, monime, creator } = await setup();
    server.accounts.get(creator.id)!.availableMinor = 10_100;
    const payout = await monime.createPayout(
      { destination: { type: "momo", providerId: "m17", phoneNumber: "23276123456" }, amount: sle(10_000), source: { financialAccountId: creator.id } },
      "payout-1",
    );
    expect(server.accounts.get(creator.id)!.availableMinor).toBe(0); // 10,000 + 1% fee

    const failed = server.settlePayout(payout.id, "failed");
    expect(failed.event.name).toBe("payout.failed");
    expect(describeMonimeFailure(failed.data as never)).toContain("provider_rejected");
    expect(server.accounts.get(creator.id)!.availableMinor).toBe(10_100);
  });

  it("rejects payout numbers with a + or the wrong length", async () => {
    const { monime, creator } = await setup();
    await expect(
      monime.createPayout(
        { destination: { type: "momo", providerId: "m17", phoneNumber: "+23276123456" }, amount: sle(1), source: { financialAccountId: creator.id } },
        "p",
      ),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("provider KYC: holder name, or a 404 for unregistered numbers", async () => {
    const { server, monime } = await setup();
    server.kyc.set("23276123456", "AMINATA KAMARA");
    expect((await monime.getProviderKyc("m17", "23276123456")).account.holderName).toBe("AMINATA KAMARA");
    const err = await monime.getProviderKyc("m17", "23299999999").catch((e) => e);
    expect(err).toBeInstanceOf(MonimeApiError);
    expect(err).toMatchObject({ status: 404, retryable: false });
  });

  it("failNext surfaces as a retryable MonimeApiError", async () => {
    const { server, monime, platform } = await setup();
    server.failNext(503, "internal_error", "down");
    await expect(monime.getFinancialAccount(platform.id)).rejects.toMatchObject({ code: "internal_error", status: 503, retryable: true });
  });
});
