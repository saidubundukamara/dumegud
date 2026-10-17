import { expect, test } from "@playwright/test";

// Database-free checks of the webhook entry point: everything here is rejected before the
// idempotency claim. Signed deliveries are covered by unit tests and the dev simulator.

test("unsigned and badly signed webhooks are rejected with 401", async ({ request }) => {
  const data = { event: { id: "wkd-e2e", name: "payment.processing_completed" }, data: {} };
  expect((await request.post("/api/webhooks/monime", { data })).status()).toBe(401);
  const forged = await request.post("/api/webhooks/monime", {
    data,
    headers: { "monime-signature": `t=${Math.floor(Date.now() / 1000)},v1=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=` },
  });
  expect(forged.status()).toBe(401);
});

test("the webhook route only accepts POST", async ({ request }) => {
  expect((await request.get("/api/webhooks/monime")).status()).toBe(405);
});

test("the dev simulator creates a fake checkout (MONIME_ENVIRONMENT=fake)", async ({ request }) => {
  const res = await request.post("/api/dev/monime-webhook", { data: { action: "create_checkout", amountMinor: 5000 } });
  expect(res.status()).toBe(200);
  const { session } = await res.json();
  expect(session).toMatchObject({ status: "pending" });
  expect(session.id).toMatch(/^scs-/);
});
