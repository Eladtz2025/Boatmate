"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus } from "lucide-react";
import type { CalendarItem, Member } from "@/lib/data";
import { cn } from "@/lib/cn";
import { formatDateRange, formatLongDate, formatShortDate } from "@/lib/format";
import { Segmented } from "@/components/ui/chips";
import { EmptyState } from "@/components/ui/empty-state";
import { AgendaList, DayHeading } from "./agenda";
import {
  HEBREW_WEEKDAYS,
  addDays,
  compareItems,
  dayKey,
  groupByDay,
  itemEndKey,
  itemStartKey,
  parseDayKey,
  startOfWeek,
} from "./date-utils";
import { EventSheet } from "./event-sheet";
import { MonthGrid } from "./month-grid";
import { NewEventSheet } from "./new-event-sheet";
import { PeriodNav } from "./period-nav";

export type CalendarView = "month" | "week" | "day" | "timeline";

const VIEWS = [
  { value: "month", label: "חודש" },
  { value: "week", label: "שבוע" },
  { value: "day", label: "יום" },
  { value: "timeline", label: "ציר זמן" },
] as const;

/** The date never changes mid-session as far as this screen is concerned. */
const noSubscribe = () => () => {};

/**
 * "Today" according to the device. The server renders with its own clock, so
 * hydration uses the server value first and swaps to the device date on the
 * commit right after — which is exactly what useSyncExternalStore is for.
 */
function useDeviceToday(serverToday: string): string {
  return useSyncExternalStore(
    noSubscribe,
    () => dayKey(new Date()),
    () => serverToday,
  );
}

/**
 * The whole calendar runs on one generous window of items fetched by the page,
 * so switching between month / week / day / timeline is pure client slicing.
 */
export function CalendarScreen({
  boatId,
  boatName,
  members,
  items,
  initialView,
  serverToday,
  openNew = false,
}: {
  boatId: string;
  boatName: string;
  members: Member[];
  items: CalendarItem[];
  initialView: CalendarView;
  serverToday: string;
  /** Arrived from a `?new=event` link (home quick action, PWA shortcut). */
  openNew?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<CalendarView>(initialView);
  const [detail, setDetail] = useState<CalendarItem | null>(null);
  const [creating, setCreating] = useState(openNew);

  const closeCreate = useCallback(() => {
    setCreating(false);
    // Drop ?new=event so a refresh does not reopen the sheet.
    if (openNew) router.replace("/calendar", { scroll: false });
  }, [openNew, router]);

  const todayKey = useDeviceToday(serverToday);

  // Both default to today and only pin to a value once the user picks one.
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const selectedKey = pickedDay ?? todayKey;
  const cursorKey = pickedMonth ?? todayKey;

  const byDay = useMemo(() => groupByDay(items), [items]);

  /** Flat agenda from today forward; anything still running is filed under today. */
  const timeline = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();

    for (const item of items) {
      if (itemEndKey(item) < todayKey) continue;
      const start = itemStartKey(item);
      const key = start < todayKey ? todayKey : start;
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }

    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, group]) => ({ key, items: [...group].sort(compareItems) }));
  }, [items, todayKey]);

  const changeView = useCallback((next: CalendarView) => {
    setView(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const selectDay = useCallback((key: string) => {
    setPickedDay(key);
    setPickedMonth(key);
  }, []);

  const openItem = useCallback((item: CalendarItem) => setDetail(item), []);

  const selectedDate = parseDayKey(selectedKey);
  const selectedItems = byDay.get(selectedKey) ?? [];
  const weekStart = startOfWeek(selectedDate);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  const shiftDays = (days: number) => selectDay(dayKey(addDays(selectedDate, days)));

  return (
    <div className="space-y-4 px-4">
      <Segmented options={VIEWS} value={view} onChange={changeView} />

      {view === "month" && (
        <>
          <MonthGrid
            cursorKey={cursorKey}
            selectedKey={selectedKey}
            todayKey={todayKey}
            byDay={byDay}
            onSelect={selectDay}
            onCursorChange={setPickedMonth}
          />

          <section>
            <DayHeading dayKey={selectedKey} isToday={selectedKey === todayKey} />
            {selectedItems.length > 0 ? (
              <AgendaList items={selectedItems} onOpen={openItem} className="mt-2" />
            ) : (
              <p className="py-6 text-center text-sm text-ink-subtle">אין אירועים ביום זה</p>
            )}
          </section>
        </>
      )}

      {view === "week" && (
        <section className="space-y-3">
          <PeriodNav
            title={
              <span className="numeric">
                {formatDateRange(weekStart, addDays(weekStart, 6))}
              </span>
            }
            onPrev={() => shiftDays(-7)}
            onNext={() => shiftDays(7)}
            prevLabel="השבוע הקודם"
            nextLabel="השבוע הבא"
          />

          <ul className="space-y-3">
            {weekDays.map((day) => {
              const key = dayKey(day);
              const dayItems = byDay.get(key) ?? [];
              const isToday = key === todayKey;

              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => {
                      selectDay(key);
                      changeView("day");
                    }}
                    className="flex w-full items-center gap-2 py-1 text-start"
                  >
                    <span
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                        isToday ? "bg-teal-400 text-hull-950" : "bg-hull-750 text-ink-muted",
                      )}
                    >
                      {HEBREW_WEEKDAYS[day.getDay()]}
                    </span>
                    <span className="numeric text-xs font-medium text-ink-muted">
                      {formatShortDate(day)}
                    </span>
                    <span className="h-px flex-1 bg-[var(--hairline)]" />
                  </button>

                  {dayItems.length > 0 ? (
                    <AgendaList items={dayItems} onOpen={openItem} className="mt-2" />
                  ) : (
                    <p className="px-1 py-1 text-xs text-ink-subtle">אין אירועים</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {view === "day" && (
        <section className="space-y-3">
          <PeriodNav
            title={formatLongDate(selectedDate)}
            onPrev={() => shiftDays(-1)}
            onNext={() => shiftDays(1)}
            prevLabel="היום הקודם"
            nextLabel="היום הבא"
          />

          {selectedItems.length > 0 ? (
            <AgendaList items={selectedItems} onOpen={openItem} />
          ) : (
            <EmptyState
              icon={<CalendarDays className="size-6" aria-hidden />}
              title="אין אירועים ביום זה"
              description="אפשר להוסיף הפלגה, הגעת שותף או טיפול תחזוקה."
            />
          )}
        </section>
      )}

      {view === "timeline" && (
        <section className="space-y-4">
          {timeline.length > 0 ? (
            timeline.map((group) => (
              <div key={group.key}>
                <DayHeading dayKey={group.key} isToday={group.key === todayKey} sticky />
                <AgendaList items={group.items} onOpen={openItem} className="mt-2" />
              </div>
            ))
          ) : (
            <EmptyState
              icon={<CalendarDays className="size-6" aria-hidden />}
              title="אין אירועים קרובים"
              description="כל מה שמתוכנן מהיום והלאה יופיע כאן."
            />
          )}
        </section>
      )}

      <button
        type="button"
        onClick={() => setCreating(true)}
        aria-label="אירוע חדש"
        className="fixed end-4 bottom-[calc(var(--nav-height)+1rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-teal-400 text-hull-950 shadow-lg shadow-teal-400/20 transition active:scale-95 hover:bg-teal-500"
      >
        <Plus className="size-6" aria-hidden />
      </button>

      <EventSheet item={detail} boatName={boatName} onClose={() => setDetail(null)} />

      {creating && (
        <NewEventSheet
          boatId={boatId}
          members={members}
          defaultDateKey={selectedKey}
          onClose={closeCreate}
        />
      )}
    </div>
  );
}
