import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { logger } from "@/server/lib/logger";
import { absoluteUrl } from "@/server/lib/site";
import { getCachedSitemapEntries } from "@/server/queries/sitemap";

// Public pages only: marketing, live creator pages and products that can be bought. Dashboards,
// auth, checkout results and the library stay out (robots.ts disallows them too).

const STATIC: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.7, changeFrequency: "monthly" },
  { path: "/register", priority: 0.6, changeFrequency: "yearly" },
  { path: "/legal/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal/creator-terms", priority: 0.3, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Request time only: the lists come from the database, which isn't there at build.
  await connection();
  const marketing = STATIC.map(({ path, priority, changeFrequency }) => ({ url: absoluteUrl(path), priority, changeFrequency }));
  try {
    const { creators, products } = await getCachedSitemapEntries();
    return [
      ...marketing,
      ...creators.map((c) => ({ url: absoluteUrl(`/${c.handle}`), lastModified: c.updatedAt, changeFrequency: "weekly" as const, priority: 0.9 })),
      ...products.map((p) => ({ url: absoluteUrl(`/p/${p.id}`), lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    ];
  } catch (error) {
    // A database hiccup shouldn't hand crawlers an error page; the marketing pages are always valid.
    logger.warn("sitemap fell back to static pages", { error: String(error) });
    return marketing;
  }
}
