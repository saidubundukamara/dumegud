import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    // Optional: run on an installed browser instead of Playwright's bundled Chromium,
    // e.g. PW_CHANNEL=chrome when the browser download is unavailable.
    channel: process.env.PW_CHANNEL || undefined,
  },
  // Mobile-first product: test a low-end Android viewport alongside desktop.
  projects: [
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
  ],
  // Run against a production build (closest to real behaviour). Skipped when E2E_BASE_URL
  // points at an already-running deployment (e.g. a Vercel preview).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npm run start -- --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
