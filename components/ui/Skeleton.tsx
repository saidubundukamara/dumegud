/** Loading placeholder with a soft shimmer. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-shimmer rounded-brand ${className}`} />;
}
