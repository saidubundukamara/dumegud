import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnv, getMonimeWebhookSecret, getR2Config, resetEnvForTests } from "@/server/env";

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

  it("requires Cloudflare credentials when the Cloudflare email provider is enabled", () => {
    vi.stubEnv("EMAIL_ENABLED", "true");
    vi.stubEnv("EMAIL_PROVIDER", "cloudflare");
    resetEnvForTests();
    expect(() => getEnv()).toThrow(/CLOUDFLARE_ACCOUNT_ID[\s\S]*CLOUDFLARE_EMAIL_API_TOKEN/);
  });

  it("requires SMTP_URL when the SMTP email provider is enabled", () => {
    vi.stubEnv("EMAIL_ENABLED", "true");
    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    resetEnvForTests();
    expect(() => getEnv()).toThrow(/SMTP_URL/);
  });

  it("defaults email to disabled", () => {
    expect(getEnv().EMAIL_ENABLED).toBe(false);
  });

  it("allows the in-memory limiter in a production build only when explicitly opted in", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("ALLOW_MEMORY_RATE_LIMIT", "true");
    resetEnvForTests();
    expect(() => getEnv()).not.toThrow();

    vi.stubEnv("VERCEL_ENV", "production");
    resetEnvForTests();
    expect(() => getEnv()).toThrow(/ALLOW_MEMORY_RATE_LIMIT/);
  });

  it("defaults Monime to the fake client and requires credentials otherwise", () => {
    expect(getEnv().MONIME_ENVIRONMENT).toBe("fake");
    vi.stubEnv("MONIME_ENVIRONMENT", "live");
    resetEnvForTests();
    expect(() => getEnv()).toThrow(/MONIME_ACCESS_TOKEN[\s\S]*MONIME_SPACE_ID/);
  });

  it("refuses the fake Monime client on Vercel production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    resetEnvForTests();
    expect(() => getEnv()).toThrow(/fake Monime/);
  });

  it("uses a built-in webhook secret only with the fake Monime", () => {
    expect(getMonimeWebhookSecret()).toBeTruthy();
    vi.stubEnv("MONIME_ENVIRONMENT", "test");
    vi.stubEnv("MONIME_ACCESS_TOKEN", "t");
    vi.stubEnv("MONIME_SPACE_ID", "s");
    resetEnvForTests();
    expect(() => getEnv()).toThrow(/MONIME_WEBHOOK_SECRET/);
  });
});

describe("getR2Config", () => {
  const creds = () => {
    vi.stubEnv("R2_ACCESS_KEY_ID", "key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://cdn.example.com/");
  };

  it("is null without an account id or endpoint", () => {
    creds();
    vi.stubEnv("R2_ACCOUNT_ID", "");
    vi.stubEnv("R2_ENDPOINT", "");
    expect(getR2Config()).toBeNull();
  });

  it("derives the endpoint from the R2 account id", () => {
    creds();
    vi.stubEnv("R2_ACCOUNT_ID", "acc1");
    expect(getR2Config()).toMatchObject({
      endpoint: "https://acc1.r2.cloudflarestorage.com",
      publicBaseUrl: "https://cdn.example.com",
    });
  });

  it("prefers an explicit endpoint (local MinIO)", () => {
    creds();
    vi.stubEnv("R2_ACCOUNT_ID", "acc1");
    vi.stubEnv("R2_ENDPOINT", "http://localhost:9000/");
    expect(getR2Config()?.endpoint).toBe("http://localhost:9000");
  });
});
