/** Loading placeholder with a soft shimmer. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-shimmer rounded-brand ${className}`} />;
}

/** Generic page-body placeholder: a few soft cards. */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-28 w-full !rounded-brand-lg" />
      <Skeleton className="h-20 w-full !rounded-brand-lg" />
      <Skeleton className="h-20 w-full !rounded-brand-lg" />
    </div>
  );
}
