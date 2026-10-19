import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const eraseDue = vi.fn();
const revalidateTag = vi.fn();
vi.mock("@/server/services", () => ({ services: { accountDeletions: { eraseDue } } }));
vi.mock("next/cache", () => ({ revalidateTag }));

const { GET } = await import("@/app/api/cron/account-deletions/route");
const { resetEnvForTests } = await import("@/server/env");

const SECRET = "cron-secret-for-tests-0123456789";
const call = (auth?: string) =>
  GET(new Request("http://localhost/api/cron/account-deletions", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  resetEnvForTests();
  eraseDue.mockReset().mockResolvedValue({ erased: 2, blocked: 1, failed: 0, tags: ["creator:p1", "handle:aminata"] });
  revalidateTag.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe("GET /api/cron/account-deletions", () => {
  it("refuses without the right bearer secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call(SECRET)).status).toBe(401); // missing the Bearer prefix
    expect(eraseDue).not.toHaveBeenCalled();
  });

  it("refuses everyone when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    resetEnvForTests();
    expect((await call("Bearer ")).status).toBe(401);
    expect(eraseDue).not.toHaveBeenCalled();
  });

  it("erases due accounts and refreshes their cached pages", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ erased: 2, blocked: 1, failed: 0 });
    expect(revalidateTag).toHaveBeenCalledWith("handle:aminata", "max");
  });
});
