import "server-only";
import { cacheLife } from "next/cache";
import { services } from "@/server/services";

/**
 * Live creator pages and buyable products for sitemap.xml. Cached for hours: crawlers fetch it
 * often, and a page that went live a little while ago can wait for the next refresh.
 */
export async function getCachedSitemapEntries() {
  "use cache";
  cacheLife("hours");
  const [creators, products] = await Promise.all([services.creators.listForSitemap(), services.products.listForSitemap()]);
  return { creators, products };
}
