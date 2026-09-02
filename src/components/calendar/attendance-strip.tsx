"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { Member } from "@/lib/data";
import {
  STRIP_DAYS,
  segmentsLabel,
  stripDates,
  type Attendance,
} from "@/lib/attendance";
import { cn } from "@/lib/cn";
import { HEBREW_WEEKDAYS, parseDayKey } from "./date-utils";
import { SegmentMarks } from "./segment-marks";

/**
 * "Who is coming to the boat, and when?" — the calendar, entire.
 *
 * A rolling strip rather than a month grid, because the question is always
 * about the next couple of weekends and a grid makes you navigate to ask it.
 * Everything a day says is on the card: the weekday, the date, who is coming
 * and which parts of the day they have taken.
 *
 * It opens on three weeks and grows in three-week blocks from the "+" at the
 * end. Growing is pure client state — the attendance behind it was fetched out
 * to the horizon in one go, so revealing a further block costs no round trip
 * and never shows a day as empty merely because its data had not arrived.
 *
 * Selection state and the editor live in `AttendanceScreen`, one level up, so
 * that tapping a day here and tapping the same day in the list below open the
 * *same* sheet in the same state. This component only reports the tap.
 *
 * The strip scrolls horizontally under `dir="rtl"`, so it never reads
 * `scrollLeft` — that counts *down* from zero here and browsers have
 * historically disagreed about the sign. Moving through it goes through
 * `scrollIntoView({ inline: "nearest" })`, which resolves against the writing
 * direction on its own.
 */

/** One attendee on a day card: who, and which parts of the day. */
function AttendeeChip({
  name,
  color,
  segments,
}: {
  name: string;
  color?: string | null;
  segments: Attendance["segments"];
}) {
  return (
    <span
      className="flex items-center justify-center gap-0.5"
      title={`${name} — ${segmentsLabel(segments)}`}
    >
      <span
        style={color ? { backgroundColor: `${color}33`, color } : undefined}
        className="flex size-4 shrink-0 items-center justify-center rounded-full bg-teal-400/20 text-[9px] font-bold text-teal-400"
      >
        {name.trim().slice(0, 1) || "?"}
      </span>
      <SegmentMarks segments={segments} iconClassName="size-2.5" />
    </span>
  );
}

export function AttendanceStrip({
  members,
  byDate,
  todayKey,
  horizonDays,
  onSelectDate,
}: {
  members: Member[];
  /** Israel calendar date → who is on the boat that day. */
  byDate: Map<string, Attendance[]>;
  todayKey: string;
  /** How far the "+" may reach — the window attendance was fetched over. */
  horizonDays: number;
  onSelectDate: (dateKey: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [visibleDays, setVisibleDays] = useState(STRIP_DAYS);

  const dates = useMemo(
    () => stripDates(todayKey, Math.min(visibleDays, horizonDays)),
    [todayKey, visibleDays, horizonDays],
  );

  const nameOf = useMemo(
    () => new Map(members.map((member) => [member.userId, member])),
    [members],
  );

  const canGrow = dates.length < horizonDays;

  // Today leads the strip, but a stray scroll position survives a refresh in
  // some browsers; put it back where it belongs on mount.
  useEffect(() => {
    trackRef.current?.children[0]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, []);

  /**
   * Reveal another block, and bring its first day into view — expanding a
   * carousel and leaving the viewport where it was reads as nothing having
   * happened. The index is captured before the state change because it is the
   * first card of the *new* block.
   */
  const grow = useCallback(() => {
    const firstNew = dates.length;
    setVisibleDays((current) => current + STRIP_DAYS);

    // After paint, so the new cards exist to be scrolled to.
    requestAnimationFrame(() => {
      trackRef.current?.children[firstNew]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    });
  }, [dates.length]);

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
              onClick={() => onSelectDate(dateKey)}
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
                          segments={row.segments}
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

        {/* Not a link and not a date: it reveals more of this same strip. */}
        {canGrow && (
          <button
            type="button"
            onClick={grow}
            aria-label={`הצגת ${STRIP_DAYS} ימים נוספים`}
            className="flex w-[4.75rem] shrink-0 snap-start flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[var(--hairline)] bg-hull-850 p-2 text-ink-muted transition active:scale-[0.97] hover:border-teal-400/40 hover:text-teal-400"
          >
            <Plus className="size-5" aria-hidden />
            <span className="text-[10px] leading-tight">עוד ימים</span>
          </button>
        )}
      </div>
    </section>
  );
}
