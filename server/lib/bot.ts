import "server-only";
import { checkBotId } from "botid/server";
import { ForbiddenError } from "./errors";
import { logger } from "./logger";

/**
 * Vercel BotID check for the auth forms (paths are registered in instrumentation-client.ts).
 * BotID only works on Vercel deployments, so it's skipped elsewhere (local dev, `next start` in
 * E2E). If the BotID service errors we fail open: rate limits still apply.
 */
export async function assertNotBot(): Promise<void> {
  if (process.env.VERCEL !== "1") return;
  let isBot: boolean;
  try {
    ({ isBot } = await checkBotId());
  } catch (err) {
    logger.warn("botid check failed; allowing request", { err });
    return;
  }
  if (isBot) throw new ForbiddenError("We couldn't verify your request. Please try again.");
}
