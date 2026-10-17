import { expect, test } from "@playwright/test";

// Database-free checks of the support return pages. The full support → webhook → transfer flow
// runs against real SQL in tests/integration/support-flow.test.ts.

function trackCsp(page: import("@playwright/test").Page) {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });
  return violations;
}

test("the success URL alone never says thank you", async ({ page }) => {
  const violations = trackCsp(page);
  await page.goto("/aminata/support/success?p=not-a-real-payment");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find this payment");
  await expect(page.getByText("Thank you")).toHaveCount(0);
  expect(violations).toEqual([]);
});

test("the cancel page changes nothing and links back", async ({ page }) => {
  const violations = trackCsp(page);
  await page.goto("/aminata/support/cancel?p=00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Payment cancelled");
  await expect(page.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/aminata");
  expect(violations).toEqual([]);
});

test("the status endpoint rejects malformed ids without a lookup", async ({ request }) => {
  const res = await request.get("/api/payments/not-a-uuid/status");
  expect(res.status()).toBe(404);
});

test("the shout-out card and page are for signed-in creators only", async ({ page, request }) => {
  const res = await request.get("/api/shoutouts/image?platform=tiktok&size=story");
  expect(res.status()).toBe(401);
  await page.goto("/dashboard/shoutouts");
  await expect(page).toHaveURL(/\/login/);
});
