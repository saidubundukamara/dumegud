import { vi } from "vitest";

// `server-only` throws when imported outside a React Server environment; unit tests run server
// modules directly in Node, so stub it.
vi.mock("server-only", () => ({}));

// Deterministic test env. Individual tests can override and call resetEnvForTests().
process.env.APP_BASE_URL ??= "http://localhost:3000";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/dumegud_test";
process.env.HASH_PEPPER ??= "test-pepper-test-pepper-test-pepper-0123";
process.env.LOG_LEVEL ??= "error";
process.env.AUTH_SECRET ??= "test-auth-secret-test-auth-secret-0123456789";
