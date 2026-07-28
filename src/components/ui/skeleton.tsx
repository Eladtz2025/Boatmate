/**
 * Loading placeholders.
 *
 * Shape-matched blocks rather than a spinner: the page keeps its geometry while
 * the data lands, so nothing jumps once it arrives. Every tab is server
 * rendered and auth-gated, so a tap always costs a round trip — without a
 * boundary the browser simply sits on the old screen and the app feels frozen.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-full bg-hull-750 ${className}`}
      aria-hidden
    />
  );
}

/** A stand-in for one `card`, with a title line and a few rows under it. */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card space-y-3 p-4">
      <Skeleton className="h-3.5 w-28" />
      <div className="space-y-2.5">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-2xl" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-14 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
