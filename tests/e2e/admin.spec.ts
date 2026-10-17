import { expect, test } from "@playwright/test";

for (const path of ["/admin", "/admin/creators", "/admin/transactions", "/admin/settings", "/admin/audit", "/admin/webhooks"]) {
  test(`signed-out visitors to ${path} are sent to /login`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  });
}

test("the audit export refuses requests without a super-admin session", async ({ request }) => {
  expect((await request.get("/api/admin/audit/export")).status()).toBe(403);
});
