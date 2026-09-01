"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import type { Member } from "@/lib/data";
import {
  STAY_LABEL,
  groupByDate,
  type Attendance,
  type Stay,
} from "@/lib/attendance";
import { cn } from "@/lib/cn";
import { HEBREW_WEEKDAYS, parseDayKey } from "./date-utils";
import { AttendanceSheet } from "./attendance-sheet";

/**
 * "Who is coming to the boat, and when?" — the calendar's front door.
 *
 * A rolling three-week strip rather than a month grid, because the question is
 * always about the next couple of weekends and a grid makes you navigate to
 * ask it. Everything a day says is on the card: the weekday, the date, who is
 * coming and whether they are sleeping over.
 *
 * The strip scrolls horizontally under `dir="rtl"`, so it never reads
 * `scrollLeft` — that counts *down* from zero here and browsers have
 * historically disagreed about the sign. Bringing today into view goes through
 * `scrollIntoView({ inline: "nearest" })`, which resolves against the writing
 * direction on its own.
 */

const STAY_ICON: Record<Stay, typeof Sun> = {
  day: Sun,
  overnight: Moon,
};

/** One attendee on a day card: who, and day or night. */
function AttendeeChip({
  name,
  color,
  stay,
}: {
  name: string;
  color?: string | null;
  stay: Stay;
}) {
  const Icon = STAY_ICON[stay];

  return (
    <span
      className="flex items-center justify-center gap-0.5"
      title={`${name} — ${STAY_LABEL[stay]}`}
    >
      <span
        style={color ? { backgroundColor: `${color}33`, color } : undefined}
        className="flex size-4 items-center justify-center rounded-full bg-teal-400/20 text-[9px] font-bold text-teal-400"
      >
        {name.trim().slice(0, 1) || "?"}
      </span>
      <Icon
        className={cn(
          "size-2.5 shrink-0",
          stay === "overnight" ? "text-ink-muted" : "text-warning",
        )}
        aria-hidden
      />
    </span>
  );
}

export function AttendanceStrip({
  boatId,
  boatName,
  members,
  currentUserId,
  attendance,
  dates,
  todayKey,
}: {
  boatId: string;
  boatName: string;
  members: Member[];
  currentUserId: string;
  attendance: Attendance[];
  /** Israel calendar days, today first. Built on the server. */
  dates: string[];
  todayKey: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const byDate = useMemo(() => groupByDate(attendance), [attendance]);
  const nameOf = useMemo(
    () => new Map(members.map((member) => [member.userId, member])),
    [members],
  );

  // Today leads the strip, but a stray scroll position survives a refresh in
  // some browsers; put it back where it belongs on mount.
  useEffect(() => {
    trackRef.current?.children[0]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, []);

  return (
    <section aria-label="מי מגיע לסירה">
      <div
        ref={trackRef}
        className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1"
      >
        {dates.map((dateKey) => {
          const date = parseDayKey(dateKey);
          const isToday = dateKey === todayKey;
          const people = byDate.get(dateKey) ?? [];
          const shown = people.slice(0, 3);
          const extra = people.length - shown.length;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => setOpenKey(dateKey)}
              aria-label={`${dateKey} — ${
                people.length > 0 ? `${people.length} מגיעים` : "אף אחד לא מגיע"
              }`}
              className={cn(
                "flex w-[4.75rem] shrink-0 snap-start flex-col items-center gap-1 rounded-2xl border p-2 transition active:scale-[0.97]",
                isToday
                  ? "border-teal-400/50 bg-teal-400/10"
                  : "border-[var(--hairline)] bg-hull-800 hover:border-teal-400/30",
              )}
            >
              <span
                className={cn(
                  "text-[11px] leading-none",
                  isToday ? "font-semibold text-teal-400" : "text-ink-muted",
                )}
              >
                {isToday ? "היום" : HEBREW_WEEKDAYS[date.getDay()]}
              </span>

              <span className="numeric text-sm font-semibold leading-none text-ink">
                {date.getDate()}.{date.getMonth() + 1}
              </span>

              {/* A day with nobody on it says so, rather than going blank —
                  an empty card and a card that failed to load look alike. */}
              <span className="flex min-h-[3.25rem] w-full flex-col items-center gap-1 pt-0.5">
                {people.length === 0 ? (
                  <span className="mt-1 text-[10px] leading-none text-ink-subtle">
                    —
                  </span>
                ) : (
                  <>
                    {shown.map((row) => {
                      const member = nameOf.get(row.userId);
                      return (
                        <AttendeeChip
                          key={row.eventId}
                          name={member?.name ?? "שותף"}
                          color={member?.color}
                          stay={row.stay}
                        />
                      );
                    })}
                    {extra > 0 && (
                      <span className="numeric text-[9px] leading-none text-ink-subtle">
                        +{extra}
                      </span>
                    )}
                  </>
                )}
              </span>
            </button>
          );
        })}
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
    </section>
  );
}
