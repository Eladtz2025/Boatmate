"use client";

import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { CalendarItem, Member } from "@/lib/data";
import {
  groupByDate,
  segmentsLabel,
  segmentsRangeLabel,
  type Attendance,
} from "@/lib/attendance";
import { formatLongDate } from "@/lib/format";
import { Segmented } from "@/components/ui/chips";
import { Avatar } from "@/components/ui/avatar";
import { AttendanceSheet } from "./attendance-sheet";
import { AttendanceStrip } from "./attendance-strip";
import { CalendarScreen, type CalendarView } from "./calendar-screen";
import { parseDayKey } from "./date-utils";
import { SegmentMarks } from "./segment-marks";

/**
 * The calendar's two jobs, in the order they are actually asked.
 *
 * "מי מגיע" is the front door and the default: a rolling strip of the next
 * three weeks, one tap to say you are coming. The full month / week / day /
 * timeline calendar is still here under "יומן" because the event system still
 * carries maintenance, payments and document expiries — attendance simply
 * stopped having to go through it.
 *
 * The open day and the editor itself live here rather than inside the strip,
 * because there are two ways in — a day card above, an attendance row below —
 * and they must land in the same sheet in the same state. One `openKey`, one
 * `<AttendanceSheet>`; the two lists only report which date was tapped.
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
  onSelectDate,
}: {
  attendance: Attendance[];
  members: Member[];
  onSelectDate: (dateKey: string) => void;
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

        return (
          <li key={row.eventId}>
            {/* Tapping a row opens the same editor the day card opens, on the
                same date — the row *is* the attendance, so it is the obvious
                thing to press when you want to change it. */}
            <button
              type="button"
              onClick={() => onSelectDate(row.dateKey)}
              aria-label={`עריכת ההגעה של ${member?.name ?? "שותף"} ב${formatLongDate(parseDayKey(row.dateKey))}`}
              className="flex w-full items-center gap-3 rounded-2xl border border-[var(--hairline)] bg-hull-800 px-3 py-2.5 text-start transition active:scale-[0.99] hover:border-teal-400/30"
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

              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="flex items-center gap-1 text-xs text-ink-muted">
                  <SegmentMarks segments={row.segments} iconClassName="size-3.5" />
                  {segmentsLabel(row.segments)}
                </span>
                <span className="numeric text-[10px] leading-none text-ink-subtle">
                  {segmentsRangeLabel(row.segments)}
                </span>
              </span>

              <ChevronLeft className="size-4 shrink-0 text-ink-subtle" aria-hidden />
            </button>
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

  // The one open day, and therefore the one editor. Both lists write here.
  const [openKey, setOpenKey] = useState<string | null>(null);

  const byDate = useMemo(() => groupByDate(attendance), [attendance]);

  return (
    <div className="space-y-4">
      <div className="px-4">
        <Segmented options={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === "attendance" ? (
        <div className="space-y-4 px-4">
          <AttendanceStrip
            members={members}
            byDate={byDate}
            dates={dates}
            todayKey={todayKey}
            onSelectDate={setOpenKey}
          />

          <div>
            <h2 className="mb-2 text-sm font-medium text-ink-muted">הגעות קרובות</h2>
            <UpcomingAttendance
              attendance={attendance}
              members={members}
              onSelectDate={setOpenKey}
            />
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

      {openKey && (
        <AttendanceSheet
          boatId={boatId}
          boatName={boatName}
          dateKey={openKey}
          members={members}
          currentUserId={currentUserId}
          attendance={byDate.get(openKey) ?? []}
          onClose={() => setOpenKey(null)}
        />
      )}
    </div>
  );
}
