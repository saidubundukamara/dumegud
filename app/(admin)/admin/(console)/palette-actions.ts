"use server";

import { requirePermission } from "@/server/dal/admin-session";
import { toActionResult } from "@/server/lib/errors";
import { enforceRateLimit } from "@/server/lib/rate-limit";
import { services } from "@/server/services";

export type CreatorHit = { userId: string; label: string; detail: string };

/** Command-palette creator search: handle prefix, exact email or user id. */
export async function searchCreatorsQuick(term: unknown): Promise<CreatorHit[]> {
  const { actor } = await requirePermission("creators.view");
  const q = typeof term === "string" ? term.trim().slice(0, 120) : "";
  if (q.length < 2) return [];
  const result = await toActionResult(async () => {
    await enforceRateLimit("admin-search:admin", actor.adminId);
    return services.admin.searchCreators(actor, q, 8);
  });
  if (!result.ok) return [];
  return result.data.map((r) => ({
    userId: r.userId,
    label: r.handle ? `@${r.handle}` : r.email,
    detail: [r.handle ? r.email : null, r.status !== "active" ? r.status : null].filter(Boolean).join(" · "),
  }));
}
