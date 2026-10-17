import type { ReactNode } from "react";

/** Small pill label that sits above a heading. */
export function Eyebrow({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "neutral" | "light" }) {
  const tones = {
    primary: "bg-primary-soft text-primary-pressed",
    neutral: "bg-surface-muted text-muted",
    light: "bg-white/10 text-white/80 ring-1 ring-white/15",
  };
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${tones[tone]}`}>
      {children}
    </span>
  );
}

type StatusTone = "success" | "warning" | "danger" | "neutral" | "primary";

const STATUS: Record<StatusTone, string> = {
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  neutral: "bg-surface-muted text-muted",
  primary: "bg-primary-soft text-primary-pressed",
};

/** Status chip. Always give it words; colour alone must never carry a payment state. */
export function StatusChip({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold ${STATUS[tone]}`}>
      {children}
    </span>
  );
}
