import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { getAttendance, getBoat, getCurrentUser, getMembers } from "@/lib/data";
import { STRIP_HORIZON_DAYS } from "@/lib/attendance";
import { addDaysToKey, todayKey } from "@/lib/tz";
import { topUpOccurrences } from "@/lib/recurring";
import { EmptyState } from "@/components/ui/empty-state";
import { AttendanceScreen } from "@/components/calendar/attendance-screen";

export const metadata: Metadata = { title: "יומן — Boatmate" };

/**
 * The calendar is attendance now, and only attendance — "who is coming to the
 * boat, and when". The month / week / day / timeline view that used to sit
 * behind a second tab is gone.
 *
 * Attendance is read once out to `STRIP_HORIZON_DAYS` rather than to the three
 * weeks the strip opens on, because the strip's "+" reveals further blocks
 * client-side and a day must never look empty merely because its data was
 * never fetched. It is a few dozen rows for a year.
 */
export default async function CalendarPage() {
  const boat = await getBoat();

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

  // Kept even though this screen no longer renders standing orders: the
  // occurrence horizon is an app-wide invariant and topping it up is a free
  // `ON CONFLICT DO NOTHING`. See lib/recurring.ts for what a stale horizon
  // costs — it goes quiet rather than wrong, which is the worse failure.
  await topUpOccurrences(boat.id);

  // "Today" is Israel's today, not the server's — the boat is in Tel Aviv and
  // one of the partners reads this from another timezone.
  const today = todayKey();

  const [members, attendance, user] = await Promise.all([
    getMembers(boat.id),
    getAttendance(boat.id, today, addDaysToKey(today, STRIP_HORIZON_DAYS - 1)),
    getCurrentUser(),
  ]);

  return (
    <div className="mx-auto w-full max-w-lg pb-[calc(var(--nav-height)+2rem)]">
      <header className="flex items-baseline justify-between gap-3 px-4 pt-5 pb-3">
        <h1 className="text-2xl font-semibold text-ink">מי מגיע</h1>
        <span className="truncate text-xs text-ink-muted">{boat.name}</span>
      </header>

      <AttendanceScreen
        boatId={boat.id}
        boatName={boat.name}
        members={members}
        currentUserId={user?.id ?? ""}
        attendance={attendance}
        todayKey={today}
        horizonDays={STRIP_HORIZON_DAYS}
      />
    </div>
  );
}
