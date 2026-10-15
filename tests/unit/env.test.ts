import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnv, resetEnvForTests } from "@/server/env";

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe("getEnv", () => {
  it("parses a valid environment", () => {
    expect(getEnv().APP_BASE_URL).toBe("http://localhost:3000");
  });

  it("reports every invalid variable", () => {
    vi.stubEnv("DATABASE_URL", "not-a-url");
    vi.stubEnv("HASH_PEPPER", "short");
    resetEnvForTests();
    expect(() => getEnv()).toThrow(/DATABASE_URL[\s\S]*HASH_PEPPER/);
  });

  it("requires Upstash in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    resetEnvForTests();
    expect(() => getEnv()).toThrow(/Upstash/);
  });
});
