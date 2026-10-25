import "server-only";
import { unstable_rethrow } from "next/navigation";
import { logger } from "./logger";

// Typed errors thrown by services. Server Actions and Route Handlers translate them with
// toActionResult / toHttpResponse so error handling and user-facing messages live in one place.

export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;
  /** Safe to show to the end user. Never put internal details here. */
  readonly publicMessage: string;

  constructor(publicMessage: string, options?: { cause?: unknown }) {
    super(publicMessage, options);
    this.name = new.target.name;
    this.publicMessage = publicMessage;
  }
}

export class ValidationError extends AppError {
  readonly code = "VALIDATION";
  readonly status = 400;
  constructor(
    message = "Please check the highlighted fields.",
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

export class UnauthenticatedError extends AppError {
  readonly code = "UNAUTHENTICATED";
  readonly status = 401;
  constructor(message = "Please sign in to continue.") {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  readonly code = "FORBIDDEN";
  readonly status = 403;
  constructor(message = "You don't have permission to do that.") {
    super(message);
  }
}

/** A sensitive admin action needs a fresh authenticator code (step-up, 10 minutes). */
export class StepUpRequiredError extends AppError {
  readonly code = "STEP_UP_REQUIRED";
  readonly status = 403;
  constructor(message = "Enter a code from your authenticator app to continue (sensitive action).") {
    super(message);
  }
}

export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND";
  readonly status = 404;
  constructor(message = "We couldn't find what you were looking for.") {
    super(message);
  }
}

export class ConflictError extends AppError {
  readonly code = "CONFLICT";
  readonly status = 409;
  constructor(message = "That conflicts with existing data.") {
    super(message);
  }
}

export class RateLimitedError extends AppError {
  readonly code = "RATE_LIMITED";
  readonly status = 429;
  constructor(
    readonly retryAfterSeconds: number,
    message = "Too many attempts. Please wait a moment and try again.",
  ) {
    super(message);
  }
}

export class ExternalServiceError extends AppError {
  readonly code = "EXTERNAL_SERVICE";
  readonly status = 502;
  constructor(
    readonly service: string,
    message = "A service we depend on is unavailable. Please try again shortly.",
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string[]> };

/**
 * Run a Server Action body and convert thrown AppErrors into a serialisable result.
 * Next.js control-flow errors (redirect, notFound, forbidden, …) are rethrown untouched.
 */
export async function toActionResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AppError) {
      return {
        ok: false,
        code: err.code,
        message: err.publicMessage,
        ...(err instanceof ValidationError ? { fieldErrors: err.fieldErrors } : {}),
      };
    }
    logger.error("unhandled error in server action", { err });
    return { ok: false, code: "INTERNAL", message: GENERIC_MESSAGE };
  }
}

/** Convert any thrown value into a JSON Response for Route Handlers. */
export function toHttpResponse(err: unknown): Response {
  if (err instanceof AppError) {
    const headers: HeadersInit =
      err instanceof RateLimitedError ? { "Retry-After": String(err.retryAfterSeconds) } : {};
    return Response.json(
      {
        error: { code: err.code, message: err.publicMessage },
        ...(err instanceof ValidationError ? { fieldErrors: err.fieldErrors } : {}),
      },
      { status: err.status, headers },
    );
  }
  logger.error("unhandled error in route handler", { err });
  return Response.json({ error: { code: "INTERNAL", message: GENERIC_MESSAGE } }, { status: 500 });
}
