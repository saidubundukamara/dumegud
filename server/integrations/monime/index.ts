import "server-only";
import type { Env } from "@/server/env";
import { createMonimeClient } from "./client";
import { sharedFakeMonimeServer } from "./fake";
import type { MonimeClient } from "./types";

export { availableBalanceMinor, MonimeApiError } from "./client";
export { describeMonimeFailure, resolveCheckoutSessionId, sumMonimeFees } from "./parse";
export type * from "./types";

export function createMonime(env: Env): MonimeClient {
  if (env.MONIME_ENVIRONMENT === "fake") return sharedFakeMonimeServer().client();
  return createMonimeClient({
    baseUrl: env.MONIME_BASE_URL,
    accessToken: env.MONIME_ACCESS_TOKEN!,
    spaceId: env.MONIME_SPACE_ID!,
    version: env.MONIME_VERSION,
  });
}
