import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/server/lib/errors";
import { assertSameOrigin } from "@/server/lib/origin";

function req(method: string, headers: Record<string, string>) {
  return new Request("https://dumegud.com/api/thing", { method, headers });
}

describe("assertSameOrigin", () => {
  it("allows safe methods without checks", () => {
    expect(() => assertSameOrigin(req("GET", {}))).not.toThrow();
    expect(() => assertSameOrigin(req("HEAD", {}))).not.toThrow();
  });

  it("allows same-origin POST", () => {
    expect(() =>
      assertSameOrigin(req("POST", { origin: "https://dumegud.com", host: "dumegud.com", "sec-fetch-site": "same-origin" })),
    ).not.toThrow();
  });

  it("rejects cross-origin POST", () => {
    expect(() => assertSameOrigin(req("POST", { origin: "https://evil.example", host: "dumegud.com" }))).toThrow(ForbiddenError);
  });

  it("rejects cross-site fetch metadata even if Origin is spoofed to match", () => {
    expect(() =>
      assertSameOrigin(req("POST", { origin: "https://dumegud.com", host: "dumegud.com", "sec-fetch-site": "cross-site" })),
    ).toThrow(ForbiddenError);
  });

  it("rejects missing or malformed Origin", () => {
    expect(() => assertSameOrigin(req("DELETE", { host: "dumegud.com" }))).toThrow(ForbiddenError);
    expect(() => assertSameOrigin(req("POST", { origin: "null", host: "dumegud.com" }))).toThrow(ForbiddenError);
  });

  it("honours x-forwarded-host", () => {
    expect(() =>
      assertSameOrigin(req("PATCH", { origin: "https://dumegud.com", host: "internal:3000", "x-forwarded-host": "dumegud.com" })),
    ).not.toThrow();
  });
});
