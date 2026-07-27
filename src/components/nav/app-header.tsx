import Link from "next/link";
import { Anchor, Bell, Settings } from "lucide-react";

/** Home header: settings on one side, the boat identity centred, alerts on the other. */
export function AppHeader({
  boatName,
  tagline,
  alertCount = 0,
}: {
  boatName: string;
  tagline?: string | null;
  alertCount?: number;
}) {
  return (
    <header className="flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
      <Link
        href="/settings"
        aria-label="הגדרות"
        className="rounded-full p-2 text-ink-muted transition hover:bg-hull-800 hover:text-ink"
      >
        <Settings className="size-5" aria-hidden />
      </Link>

      <div className="min-w-0 text-center">
        <h1 className="flex items-center justify-center gap-1.5 truncate text-base font-semibold">
          <Anchor className="size-4 shrink-0 text-teal-400" aria-hidden />
          {boatName}
        </h1>
        {tagline && <p className="truncate text-xs text-ink-muted">{tagline}</p>}
      </div>

      <Link
        href="/calendar"
        aria-label={alertCount > 0 ? `${alertCount} התראות` : "התראות"}
        className="relative rounded-full p-2 text-ink-muted transition hover:bg-hull-800 hover:text-ink"
      >
        <Bell className="size-5" aria-hidden />
        {alertCount > 0 && (
          <span className="absolute end-1 top-1 flex size-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-hull-950">
            {alertCount > 9 ? "9+" : alertCount}
          </span>
        )}
      </Link>
    </header>
  );
}

/** Simple title header for the inner tabs. */
export function PageHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      {action}
    </header>
  );
}
