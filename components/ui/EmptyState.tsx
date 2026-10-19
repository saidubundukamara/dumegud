import type { InfoIcon } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { Panel } from "./Card";

/** What a list looks like before it has anything in it: what will appear here, and how to get it. */
export function EmptyState({ icon: IconCmp, title, children, action }: { icon: typeof InfoIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Panel className="flex flex-col items-start gap-3 p-5 sm:p-6">
      <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full bg-surface-muted text-muted">
        <IconCmp weight="duotone" className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{title}</p>
        {children ? <p className="text-muted">{children}</p> : null}
      </div>
      {action}
    </Panel>
  );
}
