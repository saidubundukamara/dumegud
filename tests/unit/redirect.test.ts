import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/redirect";

describe("safeRedirectPath", () => {
  it.each(["/dashboard", "/dashboard/settings?tab=1", "/admin#x"])("allows same-origin path %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    "https://evil.example/",
    "//evil.example/x",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "dashboard",
    "/\tevil",
    "",
    undefined,
    null,
    ["/dashboard"],
  ])("rejects %s", (value) => {
    expect(safeRedirectPath(value)).toBe("/dashboard");
  });

  it("uses the given fallback", () => {
    expect(safeRedirectPath("//x", "/")).toBe("/");
  });
});
