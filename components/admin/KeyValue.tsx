import type { ReactNode } from "react";

export type KeyValueItem = [label: string, value: ReactNode] | null | false | "" | undefined;

/** Label/value pairs in two columns (one on phones). Falsy entries are skipped. */
export function KeyValue({ items, columns = 2 }: { items: KeyValueItem[]; columns?: 1 | 2 | 3 }) {
  const cols = columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : columns === 2 ? "sm:grid-cols-2" : "";
  return (
    <dl className={`grid gap-x-6 gap-y-3.5 ${cols}`}>
      {items.filter((i): i is [string, ReactNode] => Boolean(i)).map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-[0.8125rem] text-muted">{label}</dt>
          <dd className="min-w-0 break-words text-sm">{value ?? <span className="text-muted">None</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
