"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import type { CalendarItem, Member } from "@/lib/data";
import { STAY_LABEL, type Attendance } from "@/lib/attendance";
import { cn } from "@/lib/cn";
import { formatLongDate } from "@/lib/format";
import { Segmented } from "@/components/ui/chips";
import { Avatar } from "@/components/ui/avatar";
import { AttendanceStrip } from "./attendance-strip";
import { CalendarScreen, type CalendarView } from "./calendar-screen";
import { parseDayKey } from "./date-utils";

/**
 * The calendar's two jobs, in the order they are actually asked.
 *
 * "מי מגיע" is the front door and the default: a rolling strip of the next
 * three weeks, one tap to say you are coming. The full month / week / day /
 * timeline calendar is still here under "יומן" because the event system still
 * carries maintenance, payments and document expiries — attendance simply
 * stopped having to go through it.
 */

const TABS = [
  { value: "attendance", label: "מי מגיע" },
  { value: "calendar", label: "יומן" },
] as const;

type Tab = (typeof TABS)[number]["value"];

/** The next few days that actually have somebody on them. */
function UpcomingAttendance({
  attendance,
  members,
}: {
  attendance: Attendance[];
  members: Member[];
}) {
  if (attendance.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-[var(--hairline)] px-4 py-6 text-center text-sm text-ink-subtle">
        אף אחד לא רשום להגעה בשבועות הקרובים
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {attendance.slice(0, 12).map((row) => {
        const member = members.find((item) => item.userId === row.userId);
        const Icon = row.stay === "overnight" ? Moon : Sun;

        return (
          <li
            key={row.eventId}
            className="flex items-center gap-3 rounded-2xl border border-[var(--hairline)] bg-hull-800 px-3 py-2.5"
          >
            <Avatar name={member?.name ?? "שותף"} color={member?.color} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">
                {member?.name ?? "שותף"}
              </span>
              <span className="block truncate text-xs text-ink-muted">
                {formatLongDate(parseDayKey(row.dateKey))}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs text-ink-muted">
              <Icon
                className={cn(
                  "size-3.5",
                  row.stay === "overnight" ? "text-ink-muted" : "text-warning",
                )}
                aria-hidden
              />
              {STAY_LABEL[row.stay]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function CalendarTabs({
  boatId,
  boatName,
  members,
  currentUserId,
  attendance,
  dates,
  todayKey,
  items,
  initialView,
  serverToday,
  openNew = false,
}: {
  boatId: string;
  boatName: string;
  members: Member[];
  currentUserId: string;
  attendance: Attendance[];
  dates: string[];
  todayKey: string;
  items: CalendarItem[];
  initialView: CalendarView;
  serverToday: string;
  openNew?: boolean;
}) {
  // `?new=event` is a request for the event form, so it lands on the calendar.
  const [tab, setTab] = useState<Tab>(openNew ? "calendar" : "attendance");

  return (
    <div className="space-y-4">
      <div className="px-4">
        <Segmented options={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === "attendance" ? (
        <div className="space-y-4 px-4">
          <AttendanceStrip
            boatId={boatId}
            boatName={boatName}
            members={members}
            currentUserId={currentUserId}
            attendance={attendance}
            dates={dates}
            todayKey={todayKey}
          />

          <div>
            <h2 className="mb-2 text-sm font-medium text-ink-muted">הגעות קרובות</h2>
            <UpcomingAttendance attendance={attendance} members={members} />
          </div>
        </div>
      ) : (
        <CalendarScreen
          boatId={boatId}
          boatName={boatName}
          members={members}
          items={items}
          initialView={initialView}
          serverToday={serverToday}
          openNew={openNew}
        />
      )}
    </div>
  );
}
