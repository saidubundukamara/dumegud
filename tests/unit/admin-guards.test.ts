import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_ADMIN_PERMISSIONS, type AdminPermission } from "@/lib/admin-permissions";
import { initialFormState } from "@/lib/form-state";

// Every admin Server Action needs an admin session (a creator's Auth.js session doesn't count),
// refuses admins without its permission (403 via forbidden()), and sensitive ones refuse admins
// without a recent authenticator code (step-up).

process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = "true";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
/** null = no admin session; otherwise the admin's roles and permissions. */
let admin: { roles: string[]; permissions: AdminPermission[] } | null = null;
const cookieJar = new Map<string, string>();

// A signed-in creator, to show it grants nothing on the admin side.
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: ADMIN_ID, sv: 1 } }), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ updateTag: vi.fn(), revalidateTag: vi.fn(), refresh: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));

// restoreMocks (vitest.config) resets spies before each test, so install it per test.
beforeEach(async () => {
  cookieJar.clear();
  cookieJar.set("dmg_admin", "session-token");
  const { AdminAuthService } = await import("@/server/services/AdminAuthService");
  const { adminActor } = await import("@/server/services/actor");
  vi.spyOn(AdminAuthService.prototype, "resolveSession").mockImplementation(async () =>
    admin
      ? {
          actor: adminActor(ADMIN_ID, admin.roles, admin.permissions),
          sessionId: SESSION_ID,
          sessionVersion: 1,
          admin: { id: ADMIN_ID, email: "a@dumegud.test", name: "A" },
          roleNames: admin.roles,
        }
      : null,
  );
});

function actionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return actionFiles(path);
    return /actions\.ts$/.test(name) ? [path] : [];
  });
}

const FILES = actionFiles("app/(admin)");
/** The sign-in steps run before there is a session. */
const PUBLIC = new Set(["signInAdmin", "verifyAdminCode", "confirmAdminEnrollment", "acceptAdminInvite", "signOutAdmin"]);
/** Need only an admin session (their own account), no permission. */
const ANY_ADMIN_FILES = new Set(["auth-actions.ts", "step-up-actions.ts"]);

async function exportsOf(file: string) {
  const mod = (await import(`@/${file}`)) as Record<string, unknown>;
  return (Object.entries(mod).filter(([, v]) => typeof v === "function") as [string, (...a: unknown[]) => Promise<unknown>][]).filter(
    ([name]) => !PUBLIC.has(name),
  );
}

const thrown = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e as { digest?: string }).digest ?? String(e),
  );

describe("admin actions", () => {
  it("are all discovered", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(11);
  });

  it.each(FILES)("every export in %s sends a caller without an admin session to the admin sign-in", async (file) => {
    admin = null;
    const fns = await exportsOf(file);
    expect(fns.length).toBeGreaterThan(0);
    for (const [, fn] of fns) {
      expect(await thrown(fn(initialFormState, new FormData()))).toMatch(/^NEXT_REDIRECT;[a-z]+;\/login;/);
    }
  });

  it.each(FILES.filter((f) => !ANY_ADMIN_FILES.has(basename(f))))("every export in %s refuses an admin without the permission with 403", async (file) => {
    admin = { roles: ["empty"], permissions: [] };
    for (const [, fn] of await exportsOf(file)) {
      expect(await thrown(fn(initialFormState, new FormData()))).toBe("NEXT_HTTP_ERROR_FALLBACK;403");
    }
  });

  it("sensitive actions refuse an admin without step-up, before doing anything", async () => {
    admin = { roles: ["super_admin"], permissions: ALL_ADMIN_PERMISSIONS };
    const ops = await import("@/app/(admin)/admin/ops-actions");
    const { services } = await import("@/server/services");
    const spy = vi.spyOn(services.admin, "setUserStatus");
    const form = new FormData();
    form.set("userId", "22222222-2222-4222-8222-222222222222");
    form.set("status", "suspended");
    form.set("note", "test");
    const result = await ops.setUserStatus(initialFormState, form);
    expect(result).toMatchObject({ status: "error", message: expect.stringContaining("authenticator") });
    expect(spy).not.toHaveBeenCalled();
  });

  it("a step-up granted in one session doesn't carry over to another", async () => {
    admin = { roles: ["super_admin"], permissions: ALL_ADMIN_PERMISSIONS };
    const { stepUpToken, STEP_UP_COOKIE } = await import("@/server/dal/step-up");
    cookieJar.set(STEP_UP_COOKIE, stepUpToken({ adminId: ADMIN_ID, sessionId: "another-session", sessionVersion: 1 }, Math.floor(Date.now() / 1000)));
    const { requireAdminStepUp } = await import("@/server/dal/admin-session");
    await expect(requireAdminStepUp("creators.status")).rejects.toMatchObject({ code: "STEP_UP_REQUIRED" });
    cookieJar.set(STEP_UP_COOKIE, stepUpToken({ adminId: ADMIN_ID, sessionId: SESSION_ID, sessionVersion: 1 }, Math.floor(Date.now() / 1000)));
    await expect(requireAdminStepUp("creators.status")).resolves.toMatchObject({ sessionId: SESSION_ID });
  });

  it("step-up tokens are bound to the admin session and session version and expire", async () => {
    const { stepUpRemaining, stepUpToken, STEP_UP_TTL_SECONDS } = await import("@/server/dal/step-up");
    const now = 1_800_000_000;
    const who = { adminId: "a1", sessionId: "s1", sessionVersion: 3 };
    const token = stepUpToken(who, now);
    expect(stepUpRemaining(token, who, now)).toBe(STEP_UP_TTL_SECONDS);
    expect(stepUpRemaining(token, { ...who, adminId: "a2" }, now)).toBe(0);
    expect(stepUpRemaining(token, { ...who, sessionId: "s2" }, now)).toBe(0);
    expect(stepUpRemaining(token, { ...who, sessionVersion: 4 }, now)).toBe(0); // role change / suspension
    expect(stepUpRemaining(token, who, now + STEP_UP_TTL_SECONDS + 1)).toBe(0);
    expect(stepUpRemaining(`${token}x`, who, now)).toBe(0);
  });
});
