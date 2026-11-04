/**
 * Monime sends the payer back to `successUrl` / `cancelUrl` with a POST (a 307 keeps the
 * method), and a Next.js page answers POST with 405. So checkouts return to a route handler
 * that accepts both methods and 303s to the page, which the browser then loads with GET.
 */

export const CHECKOUT_RETURN_PATH = "/api/checkout/return";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The only pages a checkout may return to (no open redirect, not even within the site).
const RETURN_PAGES = [
  /^\/[a-z0-9_]{1,40}\/support\/(success|cancel)$/,
  /^\/p\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/purchase\/(success|cancel)$/i,
];

/** The URL Monime gets: `{base}/api/checkout/return?to={page}&p={paymentId}`. */
export function checkoutReturnUrl(base: string, page: string, paymentId: string): string {
  const url = new URL(CHECKOUT_RETURN_PATH, base);
  url.searchParams.set("to", page);
  url.searchParams.set("p", paymentId);
  return url.toString();
}

/** The page path (with `?p=`) to send the browser to, or null when the link isn't one of ours. */
export function resolveCheckoutReturn(to: string | null, paymentId: string | null): string | null {
  if (!to || !paymentId || !UUID.test(paymentId)) return null;
  if (!RETURN_PAGES.some((re) => re.test(to))) return null;
  return `${to}?p=${encodeURIComponent(paymentId)}`;
}
