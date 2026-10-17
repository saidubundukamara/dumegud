// Product licence options shown to buyers before purchase (PRD §5.4). Isomorphic.

export const LICENSE_TYPES = ["personal", "personal_modify", "commercial"] as const;
export type License = (typeof LICENSE_TYPES)[number];

export const LICENSE_SUMMARIES: Record<License, { label: string; summary: string }> = {
  personal: {
    label: "Personal use",
    summary: "For your own personal use. You may not share, resell, modify or redistribute it.",
  },
  personal_modify: {
    label: "Personal use, modifications allowed",
    summary: "For your own personal use, and you may adapt it. You may not share, resell or redistribute it.",
  },
  commercial: {
    label: "Commercial use",
    summary: "You may use it in your own commercial projects. You may not resell or redistribute the file itself.",
  },
};
