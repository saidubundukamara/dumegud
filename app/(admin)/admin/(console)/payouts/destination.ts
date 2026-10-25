import { humanize } from "@/lib/admin-format";

/** "Orange Money 0767…123" from a payout's destination snapshot. */
export function destinationLabel(snapshot: unknown): string {
  const d = (snapshot ?? {}) as { masked?: string; providerId?: string };
  return [d.providerId ? humanize(d.providerId) : null, d.masked].filter(Boolean).join(" ") || "Unknown number";
}

export const approvalsOf = (approvals: unknown) => (Array.isArray(approvals) ? (approvals as { by: string; at: string }[]) : []);
