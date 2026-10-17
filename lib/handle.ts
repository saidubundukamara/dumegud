// Handle rules (implementation.md Phase 2). Isomorphic: used by the profile form and the server.
// Reserved handles and the offensive deny-list live in the database (admin-managed); the
// built-in list below covers routes, so they can never be claimed even before seeding.

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;
export const HANDLE_CHANGE_COOLDOWN_DAYS = 30;
export const HANDLE_REDIRECT_DAYS = 90;

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9_]{1,28}[a-z0-9])$/;

/** Top-level routes and brand words. Keep in sync with app/ route segments. */
export const ROUTE_HANDLES: ReadonlySet<string> = new Set([
  "about", "admin", "api", "auth", "dashboard", "dumegud", "forbidden", "forgot_password", "help",
  "faq", "legal", "library", "login", "logout", "monime", "p", "pricing", "privacy", "register",
  "report", "reset_password", "settings", "signin", "signup", "staff", "static", "support", "terms",
  "verify_email", "www",
]);

export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@/, "").toLowerCase();
}

/** Format check only (no DB). Returns an error message, or null when the format is valid. */
export function handleFormatError(input: string): string | null {
  const handle = normalizeHandle(input);
  if (handle.length < HANDLE_MIN) return `Use at least ${HANDLE_MIN} characters.`;
  if (handle.length > HANDLE_MAX) return `Use at most ${HANDLE_MAX} characters.`;
  if (!HANDLE_RE.test(handle)) {
    return "Use letters, numbers and underscores, starting and ending with a letter or number.";
  }
  if (handle.includes("__")) return "Don't use two underscores in a row.";
  if (ROUTE_HANDLES.has(handle)) return "That handle isn't available.";
  return null;
}
