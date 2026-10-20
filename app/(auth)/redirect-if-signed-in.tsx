import type { Route } from "next";
import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/redirect";
import { getSession } from "@/server/dal/session";

/**
 * Guest-only pages (sign in, register, forgot password) send a signed-in browser on to the
 * dashboard, or `?next=`. Uses the database-checked session, not the JWT, so a revoked session
 * still sees the page (and its notices) instead of looping through the dashboard guard.
 * Render inside <Suspense> so the page's static shell stays prerendered.
 */
export async function RedirectIfSignedIn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (!session) return null;
  const next = (await searchParams).next;
  redirect(safeRedirectPath(Array.isArray(next) ? next[0] : next) as Route);
}
