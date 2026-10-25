import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { authConfig } from "@/auth.config";

type AuthorizedArgs = Parameters<typeof authConfig.callbacks.authorized>[0];

function authorized(path: string, signedIn: boolean) {
  const request = new NextRequest(`https://dumegud.test${path}`);
  const auth = signedIn ? { user: { id: "u1" }, expires: "" } : null;
  return authConfig.callbacks.authorized({ request, auth } as AuthorizedArgs);
}

describe("proxy authorized callback (optimistic)", () => {
  it("redirects signed-out visitors of /dashboard to /login with next", () => {
    for (const path of ["/dashboard", "/dashboard/settings?x=1"]) {
      const res = authorized(path, false) as Response;
      expect(res.status).toBe(302);
      const location = new URL(res.headers.get("location")!);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("next")).toBe(path);
    }
  });

  it("lets signed-in users through (the DAL does real checks) and ignores public pages", () => {
    expect(authorized("/dashboard", true)).toBe(true);
    // The admin has its own session on its own host; Auth.js never gates it.
    expect(authorized("/admin", false)).toBe(true);
    expect(authorized("/dashboarding", false)).toBe(true);
    expect(authorized("/", false)).toBe(true);
  });
});
