import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobContext, JobResult } from "@/server/services/JobService";

const eraseDue = vi.fn();
const reconcilePayments = vi.fn();
const revalidateTag = vi.fn();
const run = vi.fn(async (_name: string, job: (ctx: JobContext) => Promise<JobResult>) => ({
  status: "succeeded" as const,
  ...(await job({ now: new Date(), hasTime: () => true })),
}));
vi.mock("@/server/services", () => ({
  services: { jobs: { run }, accountDeletions: { eraseDue }, reconciliation: { reconcilePayments } },
}));
vi.mock("next/cache", () => ({ revalidateTag }));

const accountDeletions = await import("@/app/api/cron/account-deletions/route");
const reconcile = await import("@/app/api/cron/reconcile-payments/route");
const { resetEnvForTests } = await import("@/server/env");

const SECRET = "cron-secret-for-tests-0123456789";
const request = (path: string, auth?: string) => new Request(`http://localhost/api/cron/${path}`, { headers: auth ? { authorization: auth } : {} });
const call = (auth?: string) => accountDeletions.GET(request("account-deletions", auth));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  resetEnvForTests();
  eraseDue.mockReset().mockResolvedValue({ erased: 2, blocked: 1, failed: 0, tags: ["creator:p1", "handle:aminata"] });
  reconcilePayments.mockReset().mockResolvedValue({ processed: 3, errors: 0, tags: ["creator:p2", "creator:p2"] });
  revalidateTag.mockReset();
  run.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe("cron routes", () => {
  it("refuse without the right bearer secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call(SECRET)).status).toBe(401); // missing the Bearer prefix
    expect((await reconcile.GET(request("reconcile-payments", "Bearer wrong"))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("refuse everyone when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    resetEnvForTests();
    expect((await call("Bearer ")).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("erases due accounts under the job lease and refreshes their cached pages", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "succeeded", processed: 2, errors: 0, erased: 2, blocked: 1, failed: 0 });
    expect(run).toHaveBeenCalledWith("account-deletions", expect.any(Function));
    expect(revalidateTag).toHaveBeenCalledWith("handle:aminata", "max");
  });

  it("runs a reconciliation job and revalidates each tag once", async () => {
    const res = await reconcile.GET(request("reconcile-payments", `Bearer ${SECRET}`));
    expect(await res.json()).toEqual({ status: "succeeded", processed: 3, errors: 0 });
    expect(run).toHaveBeenCalledWith("reconcile-payments", expect.any(Function));
    expect(revalidateTag).toHaveBeenCalledTimes(1);
  });

  it("answers 500 when the run failed, so the scheduler alerts", async () => {
    run.mockResolvedValueOnce({ status: "failed" as never, processed: 0, errors: 1 });
    expect((await reconcile.GET(request("reconcile-payments", `Bearer ${SECRET}`))).status).toBe(500);
  });
});
