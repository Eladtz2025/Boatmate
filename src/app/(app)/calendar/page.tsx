import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { getBoat, getCalendarItems, getMembers } from "@/lib/data";
import { toDateInput } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarScreen, type CalendarView } from "@/components/calendar/calendar-screen";

export const metadata: Metadata = { title: "יומן — Boatmate" };

const VIEWS: readonly string[] = ["month", "week", "day", "timeline"];

const parseView = (value: string | string[] | undefined): CalendarView =>
  typeof value === "string" && VIEWS.includes(value) ? (value as CalendarView) : "month";

/** `?new=event` — the home quick action and the PWA shortcut both link here. */
const wantsNewEvent = (value: string | string[] | undefined): boolean =>
  (Array.isArray(value) ? value[0] : value) === "event";

/**
 * Fetches a wide window — three months back, twelve forward — once, so the
 * client can switch between month, week, day and timeline without a round trip.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[]; new?: string | string[] }>;
}) {
  const [params, boat] = await Promise.all([searchParams, getBoat()]);
  const { view } = params;

  if (!boat) {
    return (
      <div className="px-4 py-10 pb-24">
        <EmptyState
          icon={<CalendarDays className="size-6" aria-hidden />}
          title="אין עדיין סירה"
          description="צריך להוסיף סירה כדי לנהל את היומן המשותף."
        />
      </div>
    );
  }

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 13, 0, 23, 59, 59);

  const [items, members] = await Promise.all([
    getCalendarItems(boat.id, from.toISOString(), to.toISOString()),
    getMembers(boat.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-lg pb-24">
      <header className="flex items-baseline justify-between gap-3 px-4 pt-5 pb-3">
        <h1 className="text-2xl font-semibold text-ink">יומן</h1>
        <span className="truncate text-xs text-ink-muted">{boat.name}</span>
      </header>

      <CalendarScreen
        boatId={boat.id}
        boatName={boat.name}
        members={members}
        items={items}
        initialView={parseView(view)}
        serverToday={toDateInput(now)}
        openNew={wantsNewEvent(params.new)}
      />
    </div>
  );
}
