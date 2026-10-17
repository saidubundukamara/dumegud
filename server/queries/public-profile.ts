import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { normalizeHandle } from "@/lib/handle";
import { creatorTag, handleTag } from "@/server/lib/cache-tags";
import { services } from "@/server/services";
import type { PublicProfileResult } from "@/server/services/CreatorService";

/**
 * Public creator page data, cached for hours so traffic spikes hit the cache, not Neon.
 * Tagged by handle (refreshes when a handle is claimed or released) and by profile id
 * (refreshes on any profile edit). Server Actions call updateTag with the same tags.
 * Callers must check the handle format first so junk URLs don't fill the cache.
 */
export async function getCachedPublicProfile(handle: string): Promise<PublicProfileResult> {
  "use cache";
  cacheLife("hours");
  const handleLower = normalizeHandle(handle);
  cacheTag(handleTag(handleLower));
  const result = await services.creators.getPublicProfile(handleLower);
  if (result.kind === "found") cacheTag(creatorTag(result.profile.id));
  else if (result.kind !== "not_found") cacheTag(creatorTag(result.profileId));
  return result;
}
