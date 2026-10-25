import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { normalizeHandle } from "@/lib/handle";
import { creatorTag, handleTag, productTag, SETTINGS_TAG } from "@/server/lib/cache-tags";
import { services } from "@/server/services";
import type { PublicSupporterDTO } from "@/server/services/ContributionService";
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

/** The "recent supporters" list. Refreshed by settlement via the creator tag. */
export async function getCachedRecentSupporters(profileId: string): Promise<PublicSupporterDTO[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(creatorTag(profileId));
  return services.contributions.recentSupportersForProfile(profileId);
}

/** Fee rates and amount limits for the support widget's quote. */
export async function getCachedSupportSettings() {
  "use cache";
  cacheLife("hours");
  cacheTag(SETTINGS_TAG);
  const s = await services.settings.get();
  return {
    minMinor: s.minContributionMinor,
    maxMinor: s.maxContributionMinor,
    platformFeeBps: s.contributionFeeBps,
    monimeBpsEstimate: s.monimeCollectionBpsEstimate,
  };
}

/** Published products for a creator's shop grid. */
export async function getCachedShop(profileId: string, creatorUserId: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(creatorTag(profileId));
  return services.products.listPublicForCreator(creatorUserId);
}

/** Public product page data, or null. Callers check the id format first. */
export async function getCachedProduct(productId: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(productTag(productId));
  const product = await services.products.getPublic(productId);
  // A product can be hidden only because its creator's page isn't live yet. Tag that case with the
  // creator too, so making the page live (which refreshes the creator tag) un-hides it.
  const profileId = product ? product.creator.profileId : await services.products.ownerProfileId(productId);
  if (profileId) cacheTag(creatorTag(profileId));
  return product;
}
