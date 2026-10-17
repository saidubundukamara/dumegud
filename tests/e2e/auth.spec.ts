import { expect, test } from "@playwright/test";

// Database-free auth checks: pages render accessibly without CSP violations, and the proxy
// sends signed-out visitors to /login. Full register → verify → login flows need a database
// and run against a preview deployment (E2E_BASE_URL).

const pages = [
  { path: "/login", heading: "Sign in" },
  { path: "/register", heading: "Create your DuMeGud" },
  { path: "/forgot-password", heading: "Reset your password" },
  { path: "/reset-password?token=abc", heading: "Choose a new password" },
  { path: "/verify-email", heading: "Confirm your email" },
];

for (const { path, heading } of pages) {
  test(`${path} renders with no CSP violations`, async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && /Content Security Policy/i.test(msg.text())) violations.push(msg.text());
    });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    expect(violations).toEqual([]);
  });
}

test("login form fields are labelled", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test("login carries a safe ?next= into the form and drops off-site targets", async ({ page }) => {
  await page.goto("/login?next=%2Fdashboard%2Fsettings");
  await expect(page.locator('form input[name="next"]')).toHaveValue("/dashboard/settings");
  await page.goto("/login?next=%2F%2Fevil.example");
  await expect(page.locator('form input[name="next"]')).toHaveValue("/dashboard");
});

test("signed-out visitors to /dashboard are sent to /login with next", async ({ page }) => {
  await page.goto("/dashboard/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fsettings$/);
});

test("signed-out visitors to /dashboard/profile are sent to /login", async ({ page }) => {
  await page.goto("/dashboard/profile");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fprofile$/);
});

test("signed-out visitors to /admin are sent to /login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
});

test("register validates on the server and keeps typed values", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Aminata");
  await page.getByLabel("Email").fill("aminata@example.com");
  await page.getByLabel("Password").fill("qwertyuiop");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("That password is too common. Choose another.")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("aminata@example.com");
});
