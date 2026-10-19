import type { Route } from "next";

// One place for the facts the legal pages repeat. Change the contact address or dates here.

export const LEGAL = {
  operator: "PeekTower Limited",
  country: "Sierra Leone",
  contactEmail: "support@dumegud.com",
  /** Shown as "Last updated" on the terms and privacy pages. */
  updated: "19 October 2026",
} as const;

export const LEGAL_LINKS: { href: Route; label: string }[] = [
  { href: "/legal/terms", label: "Terms of use" },
  { href: "/legal/privacy", label: "Privacy policy" },
  { href: "/legal/creator-terms", label: "Creator terms" },
];
