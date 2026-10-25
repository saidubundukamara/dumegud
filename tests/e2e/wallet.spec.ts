import { expect, test } from "@playwright/test";

// Database-free checks for wallet routes (the admin KYC document route is in admin.spec.ts). KYC, binding, withdrawals and completion run
// on real SQL in tests/integration/payout-flow.test.ts.

for (const path of ["/dashboard/wallet", "/dashboard/verification", "/dashboard/payout-method"]) {
  test(`signed-out visitors to ${path} are sent to /login`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`));
  });
}
