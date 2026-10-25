import type { ReactNode } from "react";
import { formatDateTime } from "@/lib/admin-format";

export type TimelineItem = { id: string; at: Date | string; title: ReactNode; body?: ReactNode; detail?: unknown };

/** Events in order, each with its time, what happened and (folded away) any raw detail. */
export function Timeline({ items, empty = "Nothing recorded yet." }: { items: TimelineItem[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ol className="flex flex-col">
      {items.map((e, i) => (
        <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
          {i < items.length - 1 ? <span aria-hidden="true" className="absolute left-[5px] top-4 h-full w-px bg-border-strong" /> : null}
          <span aria-hidden="true" className="relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-surface bg-border-strong ring-1 ring-border-strong" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-sm font-medium">{e.title}</p>
              <time dateTime={new Date(e.at).toISOString()} className="text-xs text-muted tabular-nums">
                {formatDateTime(e.at)}
              </time>
            </div>
            {e.body ? <div className="text-sm text-muted">{e.body}</div> : null}
            {e.detail !== undefined && e.detail !== null ? <RawJson value={e.detail} label="Details" /> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Raw JSON, folded away by default (payloads, evidence, before/after). */
export function RawJson({ value, label = "Raw data", open = false }: { value: unknown; label?: string; open?: boolean }) {
  return (
    <details open={open} className="group mt-1 text-sm">
      <summary className="w-fit cursor-pointer select-none rounded-brand-sm text-[0.8125rem] font-medium text-muted hover:text-text">{label}</summary>
      <pre className="mt-1.5 max-h-96 overflow-auto rounded-brand-sm bg-surface-muted p-3 font-mono text-xs leading-relaxed">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
