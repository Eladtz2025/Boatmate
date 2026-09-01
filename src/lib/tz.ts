/**
 * Wall-clock arithmetic for a named timezone.
 *
 * The server runs in UTC and the app is read in Israel, so anything that turns
 * a calendar date into an instant — or an instant back into a calendar date —
 * has to name the zone or it lands hours away from the day a partner meant.
 * `lib/weather.ts` already pins `Asia/Jerusalem` for the same reason; this is
 * the same idea generalised, for attendance dates.
 *
 * Deliberately dependency-free: `Intl` already knows the DST rules, and Israel
 * changes offset twice a year.
 */

export const ISRAEL_TZ = "Asia/Jerusalem";

const PARTS = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = PARTS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    PARTS.set(timeZone, formatter);
  }
  return formatter;
}

/** How far ahead of UTC the zone is at this instant, in milliseconds. */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  // `hour12: false` reports midnight as 24 in some engines.
  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour") % 24,
    read("minute"),
    read("second"),
  );

  return asUtc - instant.getTime();
}

/**
 * "2026-09-05" at 08:00 Israel time → the real instant.
 *
 * Resolved twice: the first pass guesses the offset from the naive timestamp,
 * the second re-reads it at the instant that guess produced. One refinement is
 * enough for a one-hour DST step, which is the only kind Israel has.
 */
export function zonedTimeToUtc(
  dateKey: string,
  hour: number,
  minute = 0,
  timeZone: string = ISRAEL_TZ,
): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const naive = Date.UTC(year, (month ?? 1) - 1, day ?? 1, hour, minute);

  let instant = naive - offsetMs(new Date(naive), timeZone);
  instant = naive - offsetMs(new Date(instant), timeZone);

  return new Date(instant);
}

/** An instant → the calendar date it falls on in the zone, "2026-09-05". */
export function zonedDateKey(
  value: Date | string,
  timeZone: string = ISRAEL_TZ,
): string {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return "";
  // en-CA formats as ISO order, which is exactly the key shape we want.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(instant);
}

/** Today's calendar date in the zone. */
export const todayKey = (
  now: Date = new Date(),
  timeZone: string = ISRAEL_TZ,
): string => zonedDateKey(now, timeZone);

/** "2026-09-05" + 3 → "2026-09-08". Pure string/UTC maths, no zone involved. */
export function addDaysToKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, (month ?? 1) - 1, (day ?? 1) + days));
  return shifted.toISOString().slice(0, 10);
}
