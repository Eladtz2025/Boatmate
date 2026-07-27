"use client";

import type { CalendarItem } from "@/lib/data";
import { cn } from "@/lib/cn";
import { formatLongDate, formatMonthYear } from "@/lib/format";
import {
  HEBREW_WEEKDAYS,
  addDays,
  addMonths,
  dayKey,
  kindsOn,
  parseDayKey,
  startOfMonth,
  startOfWeek,
} from "./date-utils";
import { kindMeta } from "./kind-meta";
import { PeriodNav } from "./period-nav";

const WEEKS = 6;

export function MonthGrid({
  cursorKey,
  selectedKey,
  todayKey,
  byDay,
  onSelect,
  onCursorChange,
}: {
  cursorKey: string;
  selectedKey: string;
  todayKey: string;
  byDay: Map<string, CalendarItem[]>;
  onSelect: (key: string) => void;
  onCursorChange: (key: string) => void;
}) {
  const cursor = parseDayKey(cursorKey);
  const monthStart = startOfMonth(cursor);
  const gridStart = startOfWeek(monthStart);

  const days = Array.from({ length: WEEKS * 7 }, (_, index) => addDays(gridStart, index));

  return (
    <section className="card p-3">
      <PeriodNav
        title={formatMonthYear(monthStart)}
        onPrev={() => onCursorChange(dayKey(addMonths(monthStart, -1)))}
        onNext={() => onCursorChange(dayKey(addMonths(monthStart, 1)))}
        prevLabel="החודש הקודם"
        nextLabel="החודש הבא"
      />

      {/* dir is explicit so Sunday (א) always lands in the right-hand column */}
      <div dir="rtl" className="mt-2 grid grid-cols-7 gap-1">
        {HEBREW_WEEKDAYS.map((letter) => (
          <div key={letter} className="pb-1 text-center text-xs font-medium text-ink-subtle">
            {letter}
          </div>
        ))}

        {days.map((day) => {
          const key = dayKey(day);
          const inMonth = day.getMonth() === monthStart.getMonth();
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          const kinds = kindsOn(byDay.get(key)).slice(0, 3);

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-pressed={isSelected}
              aria-label={formatLongDate(day)}
              className="flex h-12 flex-col items-center justify-center gap-1 rounded-xl transition hover:bg-hull-750/60"
            >
              <span
                className={cn(
                  "numeric flex size-7 items-center justify-center rounded-full text-sm",
                  isSelected && "bg-teal-400 font-semibold text-hull-950",
                  !isSelected && isToday && "ring-1 ring-teal-400 text-teal-400 font-semibold",
                  !isSelected && !isToday && (inMonth ? "text-ink" : "text-ink-subtle"),
                )}
              >
                {day.getDate()}
              </span>

              <span className="flex h-1.5 items-center gap-0.5">
                {kinds.map((kind) => (
                  <span
                    key={kind}
                    className={cn("size-1.5 rounded-full", kindMeta(kind).dot)}
                    aria-hidden
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
