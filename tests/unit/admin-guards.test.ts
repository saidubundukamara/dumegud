import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialFormState } from "@/lib/form-state";

// Phase 8 acceptance: every admin Server Action refuses non-staff (403 via forbidden()), and
// sensitive ones refuse staff without a recent password confirmation (step-up).

process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = "true";

const session = { user: { id: "11111111-1111-4111-8111-111111111111", sv: 1 } };
let role: "creator" | "staff" | "super_admin" = "creator";
const cookieJar = new Map<string, string>();

vi.mock("@/auth", () => ({ auth: async () => session, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ updateTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));

// restoreMocks (vitest.config) resets spies before each test, so install it per test.
beforeEach(async () => {
  cookieJar.clear();
  const { UserRepository } = await import("@/server/repositories/UserRepository");
  vi.spyOn(UserRepository.prototype, "findAuthState").mockImplementation(async (id: string) => ({
    id,
    role,
    status: "active",
    sessionVersion: 1,
    emailVerified: new Date(),
    needsDateOfBirth: false,
  }));
});

function actionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return actionFiles(path);
    return /actions\.ts$/.test(name) ? [path] : [];
  });
}

const FILES = actionFiles("app/(admin)");

describe("admin actions", () => {
  it("are all discovered", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(8);
  });

  it.each(FILES)("every export in %s refuses a signed-in creator with 403", async (file) => {
    role = "creator";
    const mod = (await import(`@/${file}`)) as Record<string, unknown>;
    const fns = Object.entries(mod).filter(([, v]) => typeof v === "function") as [string, (...a: unknown[]) => Promise<unknown>][];
    expect(fns.length).toBeGreaterThan(0);
    for (const [, fn] of fns) {
      const error = await fn(initialFormState, new FormData()).then(
        () => null,
        (e: unknown) => e,
      );
      expect((error as { digest?: string } | null)?.digest).toBe("NEXT_HTTP_ERROR_FALLBACK;403");
    }
  });

  it("sensitive actions refuse staff without step-up, before doing anything", async () => {
    role = "super_admin";
    const ops = await import("@/app/(admin)/admin/ops-actions");
    const { services } = await import("@/server/services");
    const spy = vi.spyOn(services.admin, "setUserStatus");
    const form = new FormData();
    form.set("userId", "22222222-2222-4222-8222-222222222222");
    form.set("status", "suspended");
    form.set("note", "test");
    const result = await ops.setUserStatus(initialFormState, form);
    expect(result).toMatchObject({ status: "error", message: expect.stringContaining("Confirm your password") });
    expect(spy).not.toHaveBeenCalled();
  });

  it("step-up tokens are bound to the user and session version and expire", async () => {
    const { stepUpRemaining, stepUpToken, STEP_UP_TTL_SECONDS } = await import("@/server/dal/step-up");
    const now = 1_800_000_000;
    const token = stepUpToken("u1", 3, now);
    expect(stepUpRemaining(token, "u1", 3, now)).toBe(STEP_UP_TTL_SECONDS);
    expect(stepUpRemaining(token, "u2", 3, now)).toBe(0);
    expect(stepUpRemaining(token, "u1", 4, now)).toBe(0); // sign out everywhere / role change
    expect(stepUpRemaining(token, "u1", 3, now + STEP_UP_TTL_SECONDS + 1)).toBe(0);
    expect(stepUpRemaining(`${token}x`, "u1", 3, now)).toBe(0);
  });
});
