import { expect, test } from "@playwright/test";

// Database-free checks for public creator pages. Handles that fail the format rules are
// rejected before any database or cache access.

test("malformed handles show the not-found page", async ({ page }) => {
  for (const path of ["/ab", "/bad-handle", "/%27%20OR%201%3D1--"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/404|could not be found/i);
  }
});

test("creator terms page renders with no CSP violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });
  await page.goto("/legal/creator-terms");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Creator terms");
  expect(violations).toEqual([]);
});
