import { CardSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * Shared fallback for all four tabs.
 *
 * There was no loading boundary anywhere in the app, so tapping a tab left the
 * previous screen on display, motionless, until the server answered — which
 * reads as a slow app even when the query is quick. One boundary here covers
 * every route under (app); a tab that wants a closer likeness can add its own.
 */
export default function AppLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex-1 pb-24"
    >
      <span className="sr-only">טוען…</span>

      {/* Stands in for AppHeader / PageHeader so the top bar does not jump. */}
      <header className="flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="size-9 rounded-full" />
      </header>

      <div className="space-y-3 px-4">
        <Skeleton className="h-32 w-full rounded-[20px]" />
        <CardSkeleton rows={2} />
        <CardSkeleton rows={3} />
      </div>
    </div>
  );
}
