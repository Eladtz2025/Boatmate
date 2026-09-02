"use client";

import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { Member } from "@/lib/data";
import {
  groupByDate,
  segmentsLabel,
  segmentsRangeLabel,
  type Attendance,
} from "@/lib/attendance";
import { formatLongDate } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { AttendanceSheet } from "./attendance-sheet";
import { AttendanceStrip } from "./attendance-strip";
import { parseDayKey } from "./date-utils";
import { SegmentMarks } from "./segment-marks";

/**
 * The calendar screen: who is coming to the boat, and when. Nothing else.
 *
 * There used to be a second tab carrying the month / week / day / timeline
 * calendar. It is gone. The `events` table it read is still the table
 * attendance is stored in, but nobody was navigating a grid to answer the one
 * question this screen exists for, and a second tab made the front door look
 * like a compromise between two ideas.
 *
 * The open day and the editor live here rather than inside the strip, because
 * there are two ways in — a day card above, an attendance row below — and they
 * must land in the same sheet in the same state. One `openKey`, one
 * `<AttendanceSheet>`; the two lists only report which date was tapped.
 */

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

export function AttendanceScreen({
  boatId,
  boatName,
  members,
  currentUserId,
  attendance,
  todayKey,
  horizonDays,
}: {
  boatId: string;
  boatName: string;
  members: Member[];
  currentUserId: string;
  attendance: Attendance[];
  todayKey: string;
  /** How far ahead attendance was read — the limit the strip's "+" grows to. */
  horizonDays: number;
}) {
  // The one open day, and therefore the one editor. Both lists write here.
  const [openKey, setOpenKey] = useState<string | null>(null);

  const byDate = useMemo(() => groupByDate(attendance), [attendance]);

  return (
    <div className="space-y-4">
      <div className="space-y-4 px-4">
        <AttendanceStrip
          members={members}
          byDate={byDate}
          todayKey={todayKey}
          horizonDays={horizonDays}
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
