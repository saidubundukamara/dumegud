import "server-only";
import { hash, verify, type Algorithm, type Options } from "@node-rs/argon2";

// Argon2id with the OWASP baseline (19 MiB, t=2, p=1). Keep hashing under ~250ms on Vercel;
// re-benchmark before raising the cost.
const OPTIONS: Options = {
  algorithm: 2 satisfies Algorithm.Argon2id, // const enum; not importable under isolatedModules
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/** Never throws: a malformed stored hash is treated as a mismatch. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burn the same Argon2 cost as a real check when there is no hash to verify against (unknown
 * email, Google-only account, locked or suspended user), so response time doesn't reveal
 * whether an account exists.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("dumegud-dummy-password-for-timing-parity");
  await verifyPassword(await dummyHash, password);
  return false;
}
