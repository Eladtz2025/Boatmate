import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import {
  getAttendance,
  getBoat,
  getCalendarItems,
  getCurrentUser,
  getMembers,
} from "@/lib/data";
import { STRIP_DAYS, stripDates } from "@/lib/attendance";
import { addDaysToKey, todayKey } from "@/lib/tz";
import { topUpOccurrences } from "@/lib/recurring";
import { toDateInput } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarTabs } from "@/components/calendar/calendar-tabs";
import type { CalendarView } from "@/components/calendar/calendar-screen";

export const metadata: Metadata = { title: "יומן — Boatmate" };

const VIEWS: readonly string[] = ["month", "week", "day", "timeline"];

const parseView = (value: string | string[] | undefined): CalendarView =>
  typeof value === "string" && VIEWS.includes(value) ? (value as CalendarView) : "month";

/** `?new=event` — the PWA shortcut and the event form both link here. */
const wantsNewEvent = (value: string | string[] | undefined): boolean =>
  (Array.isArray(value) ? value[0] : value) === "event";

/**
 * The calendar leads with attendance — "who is coming to the boat, and when?" —
 * and keeps the full month / week / day / timeline calendar behind the second
 * tab for everything the event system still carries.
 *
 * The wide item window (three months back, twelve forward) is fetched once so
 * the full calendar can switch views without a round trip; attendance is a
 * separate, much narrower read over the three weeks the strip shows.
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

  // This window reaches twelve months forward while the occurrence horizon only
  // reaches 120 days, so the calendar is where a stale horizon shows first — an
  // empty autumn that looks like a settled autumn.
  await topUpOccurrences(boat.id);

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 13, 0, 23, 59, 59);

  // "Today" for attendance is Israel's today, not the server's — the boat is
  // in Tel Aviv and one of the partners reads this from another timezone.
  const today = todayKey(now);
  const dates = stripDates(today);

  const [items, members, attendance, user] = await Promise.all([
    getCalendarItems(boat.id, from.toISOString(), to.toISOString()),
    getMembers(boat.id),
    getAttendance(boat.id, today, addDaysToKey(today, STRIP_DAYS - 1)),
    getCurrentUser(),
  ]);

  return (
    // Bottom padding clears the floating + button, not just the nav.
    <div className="mx-auto w-full max-w-lg pb-[calc(var(--nav-height)+5.5rem)]">
      <header className="flex items-baseline justify-between gap-3 px-4 pt-5 pb-3">
        <h1 className="text-2xl font-semibold text-ink">יומן</h1>
        <span className="truncate text-xs text-ink-muted">{boat.name}</span>
      </header>

      <CalendarTabs
        boatId={boat.id}
        boatName={boat.name}
        members={members}
        currentUserId={user?.id ?? ""}
        attendance={attendance}
        dates={dates}
        todayKey={today}
        items={items}
        initialView={parseView(view)}
        serverToday={toDateInput(now)}
        openNew={wantsNewEvent(params.new)}
      />
    </div>
  );
}
