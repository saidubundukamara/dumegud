import { Skeleton } from "@/components/ui/Skeleton";

/** Placeholder rows shaped like a DataTable, inside a Section. */
export function TableSkeleton({ rows = 6, filters = false }: { rows?: number; filters?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="overflow-hidden rounded-brand bg-surface ring-1 ring-border">
      {filters ? (
        <div className="flex gap-3 border-b border-border px-5 py-3">
          <Skeleton className="h-9 w-40 !rounded-brand-sm" />
          <Skeleton className="h-9 w-32 !rounded-brand-sm" />
        </div>
      ) : null}
      <div className="border-b border-border px-5 py-3">
        <Skeleton className="h-3 w-1/3 !rounded-full" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-6 border-b border-border px-5 py-3.5 last:border-b-0">
          <Skeleton className="h-3.5 w-1/4 !rounded-full" />
          <Skeleton className="h-3.5 w-1/6 !rounded-full" />
          <Skeleton className="ml-auto h-3.5 w-16 !rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for a detail page body: a fact card and a list. */
export function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-6">
      <div className="grid gap-3 rounded-brand bg-surface p-5 ring-1 ring-border sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-20 !rounded-full" />
            <Skeleton className="h-4 w-40 !rounded-full" />
          </div>
        ))}
      </div>
      <TableSkeleton rows={4} />
    </div>
  );
}

/** Placeholder for a row of stat tiles. */
export function TilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-[6.25rem] w-full" />
      ))}
    </div>
  );
}
