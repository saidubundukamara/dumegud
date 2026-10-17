import "server-only";
import type { NameMatch } from "@/server/db/schema";

// Compare the mobile-money holder name (from Monime provider KYC) with the KYC legal name.
// Token-based, accent/case/punctuation-insensitive, order-independent, tolerant of initials
// ("A. Kamara" vs "Aminata Kamara") and of middle names missing on either side.

function tokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function matchNames(holderName: string | null | undefined, legalName: string): NameMatch {
  const holder = tokens(holderName ?? "");
  if (!holder.length) return "unavailable";
  const legal = tokens(legalName);
  const unmatched = [...legal];
  let full = 0;
  let initials = 0;
  for (const t of holder) {
    const exact = unmatched.indexOf(t);
    if (exact >= 0) {
      unmatched.splice(exact, 1);
      full++;
      continue;
    }
    if (t.length === 1) {
      const initial = unmatched.findIndex((l) => l.startsWith(t));
      if (initial >= 0) {
        unmatched.splice(initial, 1);
        initials++;
      }
    }
  }
  const matched = full + initials;
  // Every holder token accounted for, with at least two names (or initials) and one full name.
  if (matched === holder.length && matched >= 2 && full >= 1) return "match";
  if (full >= 1) return "partial";
  return "mismatch";
}
