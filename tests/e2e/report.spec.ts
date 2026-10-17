import { expect, test } from "@playwright/test";

test("the report form renders for a well-formed target with no CSP violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });
  await page.goto("/report?type=creator&id=00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Report a problem");
  await expect(page.getByLabel("What's wrong?")).toBeVisible();
  expect(violations).toEqual([]);
});

test("a malformed report target shows not found", async ({ page }) => {
  await page.goto("/report?type=wallet&id=nope");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/404|could not be found/i);
});

for (const path of ["/admin/risk", "/admin/limits", "/admin/reports"]) {
  test(`signed-out visitors to ${path} are sent to /login`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  });
}
