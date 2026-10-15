import { type Instrumentation } from "next";

export async function register() {
  // Observability SDK (Sentry or Vercel Observability) is initialised here in Phase 10.
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // Imported lazily: instrumentation runs before the app graph is loaded.
  const { logger } = await import("@/server/lib/logger");
  const error = err as Error & { digest?: string };
  logger.error("request error", {
    err: error,
    digest: error.digest,
    method: request.method,
    // Path only — query strings can carry tokens (reset links, download tokens).
    path: request.path.split("?")[0],
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
