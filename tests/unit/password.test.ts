import { describe, expect, it } from "vitest";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/server/lib/password";

describe("password hashing (real Argon2id)", () => {
  it("hashes with Argon2id and verifies", async () => {
    const hash = await hashPassword("a long passphrase");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(hash, "a long passphrase")).toBe(true);
    expect(await verifyPassword(hash, "a long passphrasf")).toBe(false);
  });

  it("treats a malformed hash as a mismatch", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });

  it("dummy verification always fails", async () => {
    expect(await verifyAgainstDummy("anything")).toBe(false);
  });
});
