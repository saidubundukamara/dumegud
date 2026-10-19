import type { MetadataRoute } from "next";
import { absoluteUrl, isIndexable, siteUrl } from "@/server/lib/site";

// Private and transactional areas stay out of search. Previews and local builds block everything,
// so a staging URL never competes with the real site.

const PRIVATE = [
  "/dashboard",
  "/admin",
  "/api/",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/library",
  "/report",
  "/*/support/",
  "/p/*/purchase/",
];

export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: siteUrl().origin,
  };
}
