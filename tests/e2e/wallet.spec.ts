import { expect, test } from "@playwright/test";

// Database-free checks for wallet and staff routes. KYC, binding, withdrawals and completion run
// on real SQL in tests/integration/payout-flow.test.ts.

for (const path of ["/dashboard/wallet", "/dashboard/verification", "/dashboard/payout-method"]) {
  test(`signed-out visitors to ${path} are sent to /login`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`));
  });
}

test("KYC documents are not reachable without a staff session", async ({ request }) => {
  const res = await request.get("/api/admin/kyc/00000000-0000-4000-8000-000000000000/selfie");
  expect(res.status()).toBe(403);
});
