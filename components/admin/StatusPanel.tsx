import type { InfoIcon } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

/** A whole-page message inside the console (403, 404, error): icon, title, words, actions. */
export function StatusPanel({ icon: Icon, title, children, actions }: { icon: typeof InfoIcon; title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-muted">
        <Icon weight="duotone" className="size-6" />
      </span>
      <h1 className="text-xl font-semibold tracking-[-0.02em]">{title}</h1>
      <div className="text-[0.9375rem] text-muted">{children}</div>
      <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>
    </main>
  );
}
