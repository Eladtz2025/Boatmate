import { toDateInput } from "@/lib/format";

/**
 * Day maths for the attendance strip. Everything is keyed by a local
 * `yyyy-mm-dd` string so lookups, comparisons and React keys are all plain
 * string work.
 *
 * This file used to carry a second set of helpers — `groupByDay`,
 * `compareItems`, `itemStartKey` and the rest — for the month / week / day /
 * timeline calendar. That view is gone, and so are they; what is left is what
 * the strip and the attendance sheet actually call.
 */

/** Sunday first — the Israeli week. */
export const HEBREW_WEEKDAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"] as const;

export const dayKey = (date: Date): string => toDateInput(date);

export function parseDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}
