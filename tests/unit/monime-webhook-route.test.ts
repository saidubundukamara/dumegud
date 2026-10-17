import { beforeEach, describe, expect, it, vi } from "vitest";
import { signMonimePayload } from "@/server/integrations/monime/webhook";

const handleMonime = vi.fn();
const revalidateTag = vi.fn();
vi.mock("@/server/services", () => ({ services: { webhooks: { handleMonime } } }));
vi.mock("next/cache", () => ({ revalidateTag }));

const { POST } = await import("@/app/api/webhooks/monime/route");
const { resetEnvForTests } = await import("@/server/env");

const SECRET = "whsec_route_test";
const body = JSON.stringify({ event: { id: "wkd-9", name: "payment.processing_completed" }, data: { x: 1 } });

function request(raw: string, signature: string | null, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/webhooks/monime", {
    method: "POST",
    body: raw,
    headers: { "content-type": "application/json", ...(signature ? { "monime-signature": signature } : {}), ...headers },
  });
}

const sign = (raw: string) => signMonimePayload(raw, SECRET, Math.floor(Date.now() / 1000));

beforeEach(() => {
  vi.stubEnv("MONIME_WEBHOOK_SECRET", SECRET);
  resetEnvForTests();
  handleMonime.mockReset();
  revalidateTag.mockReset();
});

describe("POST /api/webhooks/monime", () => {
  it("rejects a bad or missing signature with 401 before touching the database", async () => {
    expect((await POST(request(body, "t=1,v1=AAAA"))).status).toBe(401);
    expect((await POST(request(body, null))).status).toBe(401);
    expect(handleMonime).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies with 413", async () => {
    const big = JSON.stringify({ event: { id: "e", name: "n" }, data: { pad: "x".repeat(300_000) } });
    expect((await POST(request(big, sign(big)))).status).toBe(413);
  });

  it("answers 400 for a signed but malformed envelope", async () => {
    const raw = JSON.stringify({ hello: "world" });
    expect((await POST(request(raw, sign(raw)))).status).toBe(400);
  });

  it("maps outcomes to 200/500 and revalidates returned tags with the 'max' profile", async () => {
    handleMonime.mockResolvedValueOnce({ response: "ok", revalidate: ["payment:p1"] });
    expect((await POST(request(body, sign(body)))).status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("payment:p1", "max");
    expect(handleMonime.mock.calls[0][0]).toMatchObject({ event: { id: "wkd-9" } });

    handleMonime.mockResolvedValueOnce({ response: "retry", revalidate: [] });
    expect((await POST(request(body, sign(body)))).status).toBe(500);

    handleMonime.mockRejectedValueOnce(new Error("db down"));
    expect((await POST(request(body, sign(body)))).status).toBe(500);
  });
});
