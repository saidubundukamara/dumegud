import { NextRequest, type NextFetchEvent } from "next/server";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { describe, expect, it, vi } from "vitest";
import { adminBaseUrl, adminHostname, adminHref, isAdminHost } from "@/lib/admin-host";
import nextConfig from "@/next.config";
import proxy, { config } from "@/proxy";

// Auth.js only runs for /dashboard on the main host (covered by auth-config.test.ts).
vi.mock("next-auth", () => ({ default: () => ({ auth: async () => new Response(null, { status: 299 }) }) }));

describe("admin host", () => {
  it("defaults to admin. + the app host, and honours ADMIN_BASE_URL", () => {
    expect(adminBaseUrl({ APP_BASE_URL: "http://localhost:3000" })).toBe("http://admin.localhost:3000");
    expect(adminBaseUrl({ APP_BASE_URL: "https://www.dumegud.sl" })).toBe("https://admin.dumegud.sl");
    expect(adminBaseUrl({ APP_BASE_URL: "https://dumegud.sl", ADMIN_BASE_URL: "https://ops.dumegud.sl/" })).toBe("https://ops.dumegud.sl");
    expect(adminHostname({ APP_BASE_URL: "https://dumegud.sl" })).toBe("admin.dumegud.sl");
  });

  it("matches the Host header with or without a port, nothing else", () => {
    const env = { APP_BASE_URL: "http://localhost:3000" };
    expect(isAdminHost("admin.localhost:3000", env)).toBe(true);
    expect(isAdminHost("ADMIN.localhost", env)).toBe(true);
    expect(isAdminHost("localhost:3000", env)).toBe(false);
    expect(isAdminHost("admin.localhost.evil.test", env)).toBe(false);
    expect(isAdminHost(null, env)).toBe(false);
  });

  it("maps internal admin routes to the paths the browser uses", () => {
    expect(adminHref("/admin")).toBe("/");
    expect(adminHref("/admin/creators")).toBe("/creators");
    expect(adminHref("/admin/creators/abc?x=1" as "/admin/creators/abc")).toBe("/creators/abc?x=1");
    expect(adminHref("/admin?tab=1" as "/admin")).toBe("/?tab=1");
  });
});

describe("proxy", () => {
  const event = {} as NextFetchEvent;
  const request = (url: string, headers: Record<string, string> = {}) => new NextRequest(url, { headers: { host: new URL(url).host, ...headers } });

  it("404s the internal /admin segment on every host, and the admin API off the admin host", async () => {
    for (const url of ["http://localhost:3000/admin", "http://localhost:3000/admin/creators", "http://admin.localhost:3000/admin/kyc", "http://localhost:3000/api/admin/audit/export"]) {
      const res = (await proxy(request(url), event)) as Response;
      expect(res.status, url).toBe(404);
    }
    const api = (await proxy(request("http://admin.localhost:3000/api/admin/audit/export"), event)) as Response;
    expect(api.status).toBe(200); // NextResponse.next(): on to the route, which checks the admin session
  });

  it("keeps the creator dashboard off the admin host", async () => {
    expect(((await proxy(request("http://admin.localhost:3000/dashboard"), event)) as Response).status).toBe(404);
  });

  it("lets admin pages through to the rewrites, and leaves main-site pages to Auth.js only on /dashboard", async () => {
    expect(((await proxy(request("http://admin.localhost:3000/login"), event)) as Response).status).toBe(200);
    expect(((await proxy(request("http://localhost:3000/dashboard/settings"), event)) as Response).status).toBe(299);
    expect(((await proxy(request("http://localhost:3000/login"), event)) as Response).status).toBe(200);
  });

  it("refuses Next's own fetch for an admin Server Action redirect, so the browser follows it on the admin host", async () => {
    // Next fetches the redirect target from the server's origin; only X-Forwarded-Host still says admin.
    const forwarded = request("http://localhost:3000/login", { "x-forwarded-host": "admin.localhost:3000" });
    expect(((await proxy(forwarded, event)) as Response).status).toBe(404);
  });

  it("only runs where it must (public pages stay cacheable)", () => {
    expect(config.matcher.slice(0, 4)).toEqual(["/dashboard/:path*", "/admin", "/admin/:path*", "/api/admin/:path*"]);
    expect(config.matcher[4]).toMatchObject({ has: [{ type: "header", key: "x-forwarded-host" }] });
  });
});

describe("admin-host rewrites (next.config)", () => {
  type Rule = { source: string; destination: string; has?: { type: string; value?: string }[] };

  /** Like Next: beforeFiles rules apply in order, each to the path the previous one produced. */
  async function rewrite(host: string, path: string) {
    const { beforeFiles } = (await nextConfig.rewrites!()) as { beforeFiles: Rule[] };
    for (const rule of beforeFiles) {
      const host_ = rule.has?.find((h) => h.type === "host");
      if (host_ && !new RegExp(`^${host_.value}$`, "i").test(host)) continue;
      const params = getPathMatch(rule.source)(path);
      if (!params) continue;
      if (/^https?:/.test(rule.destination)) return rule.destination;
      path = rule.destination.replace(/:(\w+)\*?/g, (_, k: string) => [params[k]].flat().join("/"));
    }
    return path;
  }

  it("serves every admin-host path from app/(admin)/admin, once", async () => {
    expect(await rewrite("admin.localhost", "/")).toBe("/admin");
    expect(await rewrite("admin.localhost", "/login")).toBe("/admin/login");
    expect(await rewrite("admin.localhost", "/creators/abc")).toBe("/admin/creators/abc");
    expect(await rewrite("admin.localhost", "/api/admin/audit/export")).toBe("/api/admin/audit/export");
    expect(await rewrite("admin.localhost", "/_next/static/chunks/a.js")).toBe("/_next/static/chunks/a.js");
  });

  it("leaves the main host alone", async () => {
    expect(await rewrite("localhost", "/")).toBe("/");
    expect(await rewrite("localhost", "/creators")).toBe("/creators");
  });
});
