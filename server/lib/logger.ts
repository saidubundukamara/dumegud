import "server-only";

// Minimal structured JSON logger. Redacts sensitive keys at any depth so PII and secrets never
// reach log storage. Swap the sink for an observability vendor in Phase 10 without changing call sites.

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|api[-_]?key|email|phone|msisdn|pin|otp|pepper|signature|card/i;

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 6;

export function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value.cause !== undefined ? { cause: redact(value.cause, depth + 1) } : {}),
    };
  }
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[Truncated]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redact(v, depth + 1);
  }
  return out;
}

function threshold(): number {
  // Read directly (not via getEnv) so logging works even when env validation itself fails.
  const configured = process.env.LOG_LEVEL as Level | undefined;
  return LEVELS[configured && configured in LEVELS ? configured : "info"];
}

function write(level: Level, msg: string, fields?: Fields) {
  if (LEVELS[level] < threshold()) return;
  const line = JSON.stringify({
    level,
    msg,
    time: new Date().toISOString(),
    ...(fields ? (redact(fields) as Fields) : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: Fields) => write("debug", msg, fields),
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, fields?: Fields) => write("error", msg, fields),
};
