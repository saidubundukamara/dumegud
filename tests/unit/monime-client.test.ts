import { describe, expect, it, vi } from "vitest";
import {
  availableBalanceMinor,
  createMonimeClient,
  MonimeApiError,
  parseMonimeError,
  unwrapResult,
} from "@/server/integrations/monime/client";

describe("unwrapResult", () => {
  it("unwraps { result }", () => {
    expect(unwrapResult({ success: true, result: { id: "fac-1" } })).toEqual({ id: "fac-1" });
  });
  it("unwraps double-nested { result: { result } }, inner fields winning", () => {
    expect(unwrapResult({ success: true, result: { id: "scs-1", status: "x", result: { status: "completed", metadata: { a: "1" } } } })).toEqual({
      id: "scs-1",
      status: "completed",
      metadata: { a: "1" },
    });
  });
  it("passes flat bodies through", () => {
    expect(unwrapResult({ id: "fac-1" })).toEqual({ id: "fac-1" });
  });
});

describe("parseMonimeError", () => {
  it("reads the nested error", () => {
    const err = parseMonimeError({ success: false, error: { code: "validation_error", message: "bad currency" } }, 400);
    expect(err).toMatchObject({ code: "validation_error", message: "bad currency", status: 400, retryable: false });
  });
  it("falls back to flat code/message and the status", () => {
    expect(parseMonimeError({ code: "x", message: "y" }, 500)).toMatchObject({ code: "x", retryable: true });
    expect(parseMonimeError(null, 429)).toMatchObject({ code: "API_ERROR", message: "HTTP 429", retryable: true });
  });
});

describe("availableBalanceMinor", () => {
  const acc = (available: unknown) => ({ id: "f", uvan: "u", name: "n", currency: "SLE", balance: { available } }) as never;
  it("handles Money, numbers and null (null means not reported, never 0)", () => {
    expect(availableBalanceMinor(acc({ currency: "SLE", value: 1250 }))).toBe(1250);
    expect(availableBalanceMinor(acc(700))).toBe(700);
    expect(availableBalanceMinor(acc(null))).toBeNull();
  });
});

describe("createMonimeClient", () => {
  const config = { baseUrl: "https://api.monime.test/v1/", accessToken: "tok", spaceId: "spc-1", version: "caph.2025-08-23" };

  it("sends the required headers, including Monime-Version and the idempotency key", async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: true, result: { id: "fac-1", uvan: "U1" } }));
    const client = createMonimeClient({ ...config, fetch: fetchMock });
    const account = await client.createFinancialAccount({ name: "n", currency: "SLE" }, "creator-wallet-u1");

    expect(account).toEqual({ id: "fac-1", uvan: "U1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.monime.test/v1/financial-accounts");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer tok",
      "Monime-Space-Id": "spc-1",
      "Monime-Version": "caph.2025-08-23",
      "Idempotency-Key": "creator-wallet-u1",
    });
  });

  it("asks for the balance when reading an account", async () => {
    const fetchMock = vi.fn(async () => Response.json({ result: { id: "fac-1" } }));
    await createMonimeClient({ ...config, fetch: fetchMock }).getFinancialAccount("fac-1");
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://api.monime.test/v1/financial-accounts/fac-1?withBalance=true");
  });

  it("maps network failures to a retryable NETWORK_ERROR", async () => {
    const client = createMonimeClient({ ...config, fetch: async () => Promise.reject(new TypeError("fetch failed")) });
    const err = await client.getFinancialAccount("fac-1").catch((e) => e);
    expect(err).toBeInstanceOf(MonimeApiError);
    expect(err).toMatchObject({ code: "NETWORK_ERROR", retryable: true });
  });
});
