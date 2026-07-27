import type { CalendarItem } from "@/lib/data";
import { toDateInput } from "@/lib/format";

/**
 * Day maths for the calendar. Everything is keyed by a local `yyyy-mm-dd`
 * string so lookups, comparisons and React keys are all plain string work.
 */

/** Sunday first — the Israeli week. */
export const HEBREW_WEEKDAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"] as const;

/**
 * Derived items (`payment`, `doc_expiry`) come from a `date` column cast to
 * timestamptz, so they arrive as UTC midnight and must not be shifted into the
 * previous day by a local-time conversion. Real all-day events carry a proper
 * local instant and are converted normally.
 */
const UTC_MIDNIGHT = /T00:00:00(\.0+)?(Z|\+00:00)$/i;

export const dayKey = (date: Date): string => toDateInput(date);

export function parseDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function isoDayKey(iso: string, allDay: boolean): string {
  if (allDay && UTC_MIDNIGHT.test(iso)) return iso.slice(0, 10);
  return dayKey(new Date(iso));
}

export const itemStartKey = (item: CalendarItem) => isoDayKey(item.startsAt, item.allDay);

export const itemEndKey = (item: CalendarItem) => {
  const start = itemStartKey(item);
  if (!item.endsAt) return start;
  const end = isoDayKey(item.endsAt, item.allDay);
  return end < start ? start : end;
};

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

export const addMonths = (date: Date, months: number) =>
  new Date(date.getFullYear(), date.getMonth() + months, 1);

/** The Sunday of the week containing `date`. */
export const startOfWeek = (date: Date) => addDays(date, -startOfDay(date).getDay());

/** All-day items float to the top of a day, then everything sorts by clock time. */
export function compareItems(a: CalendarItem, b: CalendarItem): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return Date.parse(a.startsAt) - Date.parse(b.startsAt);
}

/**
 * day key → the items occupying that day. A multi-day item (a partner staying
 * a fortnight) is repeated on each day it covers, capped so a bad row cannot
 * blow up the map.
 */
export function groupByDay(items: CalendarItem[], maxSpanDays = 45): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();

  for (const item of items) {
    const end = parseDayKey(itemEndKey(item));
    let cursor = parseDayKey(itemStartKey(item));

    for (let step = 0; step <= maxSpanDays; step += 1) {
      const key = dayKey(cursor);
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);

      if (cursor >= end) break;
      cursor = addDays(cursor, 1);
    }
  }

  for (const bucket of map.values()) bucket.sort(compareItems);
  return map;
}

/** Distinct kinds present on a day, in the order they appear. */
export function kindsOn(items: CalendarItem[] | undefined): string[] {
  if (!items || items.length === 0) return [];
  const seen: string[] = [];
  for (const item of items) if (!seen.includes(item.kind)) seen.push(item.kind);
  return seen;
}
