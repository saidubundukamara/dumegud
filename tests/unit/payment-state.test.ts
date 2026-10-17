import { describe, expect, it } from "vitest";
import { canTransition } from "@/server/services/payment-state";

describe("payment state machine", () => {
  it("allows the forward path", () => {
    expect(canTransition("created", "pending")).toBe(true);
    expect(canTransition("pending", "succeeded")).toBe(true);
    expect(canTransition("succeeded", "reversed")).toBe(true);
    expect(canTransition("pending", "under_review")).toBe(true);
    expect(canTransition("under_review", "succeeded")).toBe(true);
  });

  it("never moves backwards", () => {
    expect(canTransition("succeeded", "expired")).toBe(false);
    expect(canTransition("succeeded", "canceled")).toBe(false);
    expect(canTransition("succeeded", "pending")).toBe(false);
    expect(canTransition("failed", "pending")).toBe(false);
    expect(canTransition("reversed", "succeeded")).toBe(false);
  });

  it("routes money that arrives after we gave up to review, not straight to succeeded", () => {
    for (const s of ["failed", "canceled", "expired"] as const) {
      expect(canTransition(s, "succeeded")).toBe(false);
      expect(canTransition(s, "under_review")).toBe(true);
    }
  });
});
