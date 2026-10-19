import type { Metadata } from "next";

// Next merges metadata shallowly: a page that sets `openGraph` replaces the layout's whole object.
// Every public page builds its tags through `pageMetadata`, so the shared Open Graph fields
// (site name, locale) and the large Twitter card are never lost on the way down.

export const SITE_NAME = "DuMeGud";

export const SHARED_OPEN_GRAPH = { siteName: SITE_NAME, locale: "en_GB" } as const;

type PageSeo = {
  /** Shown in the tab and in search results (the layout template adds " · DuMeGud"). */
  title: string;
  /** For link previews, where there's no template, so it can carry the brand itself. */
  shareTitle?: string;
  description: string;
  /** Root-relative canonical path, e.g. "/pricing". */
  path: string;
  type?: "website" | "profile";
};

export function pageMetadata({ title, shareTitle, description, path, type = "website" }: PageSeo): Metadata {
  const ogTitle = shareTitle ?? `${title} · ${SITE_NAME}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { ...SHARED_OPEN_GRAPH, type, url: path, title: ogTitle, description },
    twitter: { card: "summary_large_image", title: ogTitle, description },
  };
}

/** One clean line for descriptions: collapses whitespace and cuts at a word near `max`. */
export function toDescription(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:!?-]+$/, "")}…`;
}
