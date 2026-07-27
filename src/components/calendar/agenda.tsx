"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import type { CalendarItem } from "@/lib/data";
import { CALENDAR_KIND_LABEL } from "@/lib/constants";
import { cn } from "@/lib/cn";
import {
  formatAgorot,
  formatDateRange,
  formatLongDate,
  formatTime,
} from "@/lib/format";
import { derivedHref, isDerivedKind, kindMeta } from "./kind-meta";
import { parseDayKey } from "./date-utils";

/** "כל היום" / "08:00" / "18.6.25 - 02.7.25" for a partner's stay. */
function timeLabel(item: CalendarItem): { text: string; numeric: boolean } {
  if (item.kind === "arrival" && item.endsAt) {
    return { text: formatDateRange(item.startsAt, item.endsAt), numeric: true };
  }
  if (item.allDay) return { text: "כל היום", numeric: false };

  const start = formatTime(item.startsAt);
  if (item.endsAt && !item.allDay) {
    const sameDay = new Date(item.startsAt).toDateString() === new Date(item.endsAt).toDateString();
    if (sameDay) return { text: `${start} - ${formatTime(item.endsAt)}`, numeric: true };
  }
  return { text: start, numeric: true };
}

function RowBody({ item }: { item: CalendarItem }) {
  const meta = kindMeta(item.kind);
  const time = timeLabel(item);

  return (
    <>
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-tile",
          meta.tile,
          meta.text,
        )}
      >
        <meta.Icon className="size-5" aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
          <span className={cn(time.numeric && "numeric")}>{time.text}</span>
          <span className="text-ink-subtle">
            {CALENDAR_KIND_LABEL[item.kind] ?? CALENDAR_KIND_LABEL.other}
          </span>
          {item.location && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{item.location}</span>
            </span>
          )}
        </span>
      </span>

      {item.kind === "payment" && item.amountAgorot != null && (
        <span className="numeric shrink-0 text-sm font-semibold text-ink">
          {formatAgorot(item.amountAgorot)}
        </span>
      )}
    </>
  );
}

const ROW =
  "flex w-full items-center gap-3 rounded-2xl border border-[var(--hairline)] bg-hull-800 " +
  "px-3 py-2.5 text-start transition active:scale-[0.99] hover:border-teal-400/30";

/**
 * A single agenda line. Real events open the detail sheet; the two derived
 * kinds are read-only here and link to the screen that owns them.
 */
export function AgendaRow({
  item,
  onOpen,
}: {
  item: CalendarItem;
  onOpen: (item: CalendarItem) => void;
}) {
  if (isDerivedKind(item.kind)) {
    return (
      <Link href={derivedHref(item.kind)} className={ROW}>
        <RowBody item={item} />
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => onOpen(item)} className={ROW}>
      <RowBody item={item} />
    </button>
  );
}

export function AgendaList({
  items,
  onOpen,
  className,
}: {
  items: CalendarItem[];
  onOpen: (item: CalendarItem) => void;
  className?: string;
}) {
  return (
    <ul className={cn("space-y-2", className)}>
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`}>
          <AgendaRow item={item} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}

/** Sticky date heading used by the timeline view. */
export function DayHeading({
  dayKey: key,
  isToday,
  sticky = false,
}: {
  dayKey: string;
  isToday?: boolean;
  sticky?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1.5",
        sticky && "sticky top-0 z-10 -mx-4 bg-hull-900/95 px-4 backdrop-blur",
      )}
    >
      <h3
        className={cn(
          "text-xs font-semibold",
          isToday ? "text-teal-400" : "text-ink-muted",
        )}
      >
        {formatLongDate(parseDayKey(key))}
      </h3>
      {isToday && (
        <span className="rounded-full bg-teal-400/15 px-2 py-0.5 text-[11px] font-medium text-teal-400">
          היום
        </span>
      )}
      <span className="h-px flex-1 bg-[var(--hairline)]" />
    </div>
  );
}
