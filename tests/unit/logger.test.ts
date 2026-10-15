import { describe, expect, it } from "vitest";
import { redact } from "@/server/lib/logger";

describe("redact", () => {
  it("redacts sensitive keys at any depth", () => {
    const out = redact({
      user: { email: "a@b.c", name: "Ama" },
      password: "hunter2",
      headers: { Authorization: "Bearer x" },
      payout: { msisdn: "23276000000", amountMinor: 500 },
      list: [{ token: "t" }],
    });
    expect(out).toEqual({
      user: { email: "[REDACTED]", name: "Ama" },
      password: "[REDACTED]",
      headers: { Authorization: "[REDACTED]" },
      payout: { msisdn: "[REDACTED]", amountMinor: 500 },
      list: [{ token: "[REDACTED]" }],
    });
  });

  it("serialises errors", () => {
    const out = redact(new Error("boom")) as { message: string; name: string };
    expect(out.name).toBe("Error");
    expect(out.message).toBe("boom");
  });
});
