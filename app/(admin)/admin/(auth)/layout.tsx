import type { ReactNode } from "react";

/** Sign-in, two-step and invite: one narrow card, the brand above it, nothing else. */
export default function AdminAuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center bg-sidebar px-4 py-10 sm:justify-center sm:py-16">
      <div className="mb-6 flex items-center gap-2">
        <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-brand-sm bg-primary text-sm font-bold tracking-[-0.04em] text-primary-foreground">
          D
        </span>
        <span className="text-base font-bold tracking-[-0.03em]">DuMeGud</span>
        <span className="text-sm font-medium text-muted">Admin</span>
      </div>
      <div className="w-full max-w-[26rem] rounded-brand bg-surface p-6 shadow-soft ring-1 ring-border sm:p-8">{children}</div>
      <p className="mt-6 text-center text-xs text-muted">Staff only. Every sign-in is recorded.</p>
    </div>
  );
}
