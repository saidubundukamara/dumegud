import { expect, test } from "@playwright/test";

// The admin lives only on admin.<host> (Chromium resolves *.localhost to loopback). Its sign-in,
// TOTP and RBAC flows run on real SQL in tests/integration/admin-rbac.test.ts.

const main = new URL(process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`);
const ADMIN = process.env.E2E_ADMIN_BASE_URL ?? `${main.protocol}//admin.${main.host.replace(/^www\./, "")}`;

for (const path of ["/admin", "/admin/creators", "/admin/login", "/api/admin/audit/export"]) {
  test(`the main site has no ${path}`, async ({ request }) => {
    expect((await request.get(path)).status()).toBe(404);
  });
}

const CONSOLE = [
  "/",
  "/creators",
  "/transactions",
  "/kyc",
  "/payouts",
  "/payouts/all",
  "/products",
  "/reports",
  "/risk",
  "/risk/rules",
  "/limits",
  "/settings",
  "/categories",
  "/webhooks",
  "/audit",
  "/admins",
  "/roles",
  "/account",
  // Detail pages check the session before the id.
  "/creators/00000000-0000-4000-8000-000000000000",
  "/payouts/00000000-0000-4000-8000-000000000000",
  "/risk/cases/00000000-0000-4000-8000-000000000000",
];

for (const path of CONSOLE) {
  test(`signed-out visitors to admin ${path} are sent to the admin sign-in`, async ({ page }) => {
    await page.goto(`${ADMIN}${path}`);
    await expect(page).toHaveURL(`${ADMIN}/login`);
  });
}

test("the admin sign-in renders, unindexed, with no CSP violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });
  const res = await page.goto(`${ADMIN}/login`);
  expect(res?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Admin sign-in");
  expect(violations).toEqual([]);
});

test("the admin host serves no creator pages, and its internal paths aren't addressable", async ({ page }) => {
  for (const path of ["/dashboard", "/admin", "/admin/creators"]) {
    expect((await page.goto(`${ADMIN}${path}`))?.status(), path).toBe(404);
  }
});

test("admin APIs refuse requests without an admin session", async ({ page }) => {
  // From the admin origin (Chrome won't navigate to an empty 403, and Node may not resolve *.localhost).
  await page.goto(`${ADMIN}/login`);
  const statuses = await page.evaluate(() =>
    Promise.all(["/api/admin/audit/export", "/api/admin/kyc/00000000-0000-4000-8000-000000000000/selfie"].map(async (u) => (await fetch(u)).status)),
  );
  expect(statuses).toEqual([403, 403]);
});
