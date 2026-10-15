import { describe, expect, it } from "vitest";
import {
  NotFoundError,
  RateLimitedError,
  toActionResult,
  toHttpResponse,
  ValidationError,
} from "@/server/lib/errors";

describe("toActionResult", () => {
  it("wraps success", async () => {
    await expect(toActionResult(async () => 42)).resolves.toEqual({ ok: true, data: 42 });
  });

  it("maps AppErrors to public messages with field errors", async () => {
    const result = await toActionResult(async () => {
      throw new ValidationError("Bad input", { handle: ["Taken"] });
    });
    expect(result).toEqual({ ok: false, code: "VALIDATION", message: "Bad input", fieldErrors: { handle: ["Taken"] } });
  });

  it("hides unexpected errors behind a generic message", async () => {
    const result = await toActionResult(async () => {
      throw new Error("db password is hunter2");
    });
    expect(result).toEqual({ ok: false, code: "INTERNAL", message: "Something went wrong. Please try again." });
  });
});

describe("toHttpResponse", () => {
  it("uses the error status and sets Retry-After for rate limits", async () => {
    const res = toHttpResponse(new RateLimitedError(30));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(toHttpResponse(new NotFoundError()).status).toBe(404);
  });

  it("returns 500 without leaking internals", async () => {
    const res = toHttpResponse(new Error("secret detail"));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret detail");
  });
});
