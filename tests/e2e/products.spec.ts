import { expect, test } from "@playwright/test";

// Database-free checks for product, library and download URLs. The full purchase → entitlement
// → download flow runs on real SQL in tests/integration/product-flow.test.ts.

test("malformed product ids show not found", async ({ page }) => {
  await page.goto("/p/not-a-product");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/404|could not be found/i);
});

test("a malformed library token shows not found", async ({ page }) => {
  await page.goto("/library/short");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/404|could not be found/i);
});

test("a forged download token is refused and lands on the recovery page", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });
  await page.goto("/api/downloads/forged.token");
  await expect(page).toHaveURL(/\/library\?download=invalid$/);
  await expect(page.getByText("That download link isn't valid.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lost your download link?");
  expect(violations).toEqual([]);
});

test("signed-out visitors to the product dashboard are sent to /login", async ({ page }) => {
  await page.goto("/dashboard/products");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fproducts$/);
});
