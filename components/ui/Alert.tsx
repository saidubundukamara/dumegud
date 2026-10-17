import type { ReactNode } from "react";

type Tone = "success" | "danger" | "warning" | "info";

const TONES: Record<Tone, string> = {
  success: "border-success bg-success-surface",
  danger: "border-danger bg-danger-surface",
  warning: "border-warning bg-warning-surface",
  info: "border-border bg-surface",
};

/** Message box. Errors are announced immediately (role=alert); everything else politely. */
export function Alert({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-brand border-l-4 px-4 py-3 ${TONES[tone]}`}>
      {children}
    </div>
  );
}
