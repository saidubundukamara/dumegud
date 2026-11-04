import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/checkout/return/route";
import { checkoutReturnUrl, resolveCheckoutReturn } from "@/lib/checkout-return";
import { getEnv } from "@/server/env";

const PID = "8efa2f8b-14fb-4edd-86ac-8756ce8f9082";
const PRODUCT = "11111111-2222-4333-8444-555555555555";

describe("checkout return", () => {
  it("builds the URL Monime is given", () => {
    const url = new URL(checkoutReturnUrl("https://dumegud.com", "/kotor/support/success", PID));
    expect(url.pathname).toBe("/api/checkout/return");
    expect(resolveCheckoutReturn(url.searchParams.get("to"), url.searchParams.get("p"))).toBe(`/kotor/support/success?p=${PID}`);
  });

  it("only returns to our success and cancel pages", () => {
    expect(resolveCheckoutReturn("/kotor/support/cancel", PID)).toBe(`/kotor/support/cancel?p=${PID}`);
    expect(resolveCheckoutReturn(`/p/${PRODUCT}/purchase/success`, PID)).toBe(`/p/${PRODUCT}/purchase/success?p=${PID}`);
    for (const to of ["//evil.com/x/support/success", "https://evil.com", "/kotor/support/success/../../x", "/kotor", "/dashboard", null]) {
      expect(resolveCheckoutReturn(to, PID)).toBeNull();
    }
    expect(resolveCheckoutReturn("/kotor/support/success", "not-a-uuid")).toBeNull();
  });

  it.each([
    ["POST", POST],
    ["GET", GET],
  ])("answers %s with a 303 to the page, so the browser loads it with GET", (method, handler) => {
    const res = handler(new Request(checkoutReturnUrl("http://localhost", "/kotor/support/success", PID), { method }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(new URL(`/kotor/support/success?p=${PID}`, getEnv().APP_BASE_URL).toString());
  });

  it("sends a link that isn't ours to the home page", () => {
    const res = POST(new Request(`http://localhost/api/checkout/return?to=${encodeURIComponent("https://evil.com")}&p=${PID}`, { method: "POST" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(new URL("/", getEnv().APP_BASE_URL).toString());
  });
});
