import "server-only";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { Adapter } from "next-auth/adapters";
import { getDb } from "@/server/db/client";
import { accounts, users, verificationTokens } from "@/server/db/schema";

/**
 * Auth.js adapter, used for the Google (OAuth) flow: creating users and linking accounts.
 * It lives in the repository layer because it talks to the database directly.
 * Emails are lowercased to satisfy the `users_email_lowercase` constraint, so they match
 * credentials sign-ups.
 */
export function createAuthAdapter(): Adapter {
  const base = DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    verificationTokensTable: verificationTokens,
  });
  return {
    ...base,
    createUser: (user) => base.createUser!({ ...user, email: user.email.trim().toLowerCase() }),
    getUserByEmail: (email) => base.getUserByEmail!(email.trim().toLowerCase()),
  };
}
