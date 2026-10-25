import type { ReactNode } from "react";
import { humanize, toneOf, type Tone } from "@/lib/admin-format";

const TONES: Record<Tone, string> = {
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  neutral: "bg-surface-muted text-muted",
  primary: "bg-primary-soft text-primary-pressed",
};

/** Compact status label. Always words: colour alone never carries a state. */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

/** A status value from the database, in words and its usual tone. */
export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
  return <Badge tone={toneOf(status)}>{label ?? humanize(status)}</Badge>;
}
