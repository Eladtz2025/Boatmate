import { ISRAEL_TZ, addDaysToKey, zonedDateKey, zonedTimeToUtc } from "./tz";

/**
 * "Who is coming to the boat, and when?"
 *
 * Attendance is not a new table. It is an `events` row with `kind = 'arrival'`
 * and a `user_id` — the same rows the home screen's arrival tile and the
 * calendar agenda have always read. That is deliberate: the boat already has
 * one place where "somebody is on the boat that day" lives, and a parallel
 * table would have meant two answers to the same question.
 *
 * The stay type is **derived from the dates**, not stored in a flag column:
 *
 *   day       08:00 → 20:00 the same day
 *   overnight 08:00 → 10:00 the following day
 *
 * so an attendance row is readable as an ordinary calendar event by every
 * screen that already renders one, and a partner who books a stay through the
 * full event form still shows up in the strip. The hours are Israel wall-clock
 * and are resolved through `lib/tz.ts`; storing them naively would file an
 * 08:00 arrival under the previous day for anyone reading from a UTC server.
 */

export type Stay = "day" | "overnight";

/** Israel wall-clock hours an attendance day occupies. */
export const ATTENDANCE_HOURS = {
  /** Nobody books the boat for 03:00; a morning start is what "coming" means. */
  start: 8,
  dayEnd: 20,
  /** An overnight stay ends the next morning, not at midnight. */
  overnightEnd: 10,
} as const;

export const STAY_LABEL: Record<Stay, string> = {
  day: "ליום",
  overnight: "לינה",
};

export type Attendance = {
  /** The `events` row id — what an edit or a cancel addresses. */
  eventId: string;
  userId: string;
  /** Israel calendar date the stay starts on, "2026-09-05". */
  dateKey: string;
  stay: Stay;
};

/** The instants an attendance row occupies, as ISO strings for Postgres. */
export function attendanceWindow(
  dateKey: string,
  stay: Stay,
  timeZone: string = ISRAEL_TZ,
): { startsAt: string; endsAt: string } {
  const startsAt = zonedTimeToUtc(
    dateKey,
    ATTENDANCE_HOURS.start,
    0,
    timeZone,
  ).toISOString();

  const endsAt =
    stay === "overnight"
      ? zonedTimeToUtc(
          addDaysToKey(dateKey, 1),
          ATTENDANCE_HOURS.overnightEnd,
          0,
          timeZone,
        ).toISOString()
      : zonedTimeToUtc(dateKey, ATTENDANCE_HOURS.dayEnd, 0, timeZone).toISOString();

  return { startsAt, endsAt };
}

/**
 * Read the stay back out of a row. Anything that finishes on a later calendar
 * day than it started is an overnight — including a multi-day stay booked
 * through the full event form, which is genuinely "sleeping on the boat".
 */
export function stayOf(
  startsAt: string,
  endsAt: string | null | undefined,
  timeZone: string = ISRAEL_TZ,
): Stay {
  if (!endsAt) return "day";
  return zonedDateKey(endsAt, timeZone) > zonedDateKey(startsAt, timeZone)
    ? "overnight"
    : "day";
}

/** The UTC half-open range covering one Israel calendar day. */
export function dayRange(
  dateKey: string,
  timeZone: string = ISRAEL_TZ,
): { from: string; to: string } {
  return {
    from: zonedTimeToUtc(dateKey, 0, 0, timeZone).toISOString(),
    to: zonedTimeToUtc(addDaysToKey(dateKey, 1), 0, 0, timeZone).toISOString(),
  };
}

/** `dateKey → attendance`, for the strip's per-day lookup. */
export function groupByDate(
  rows: Attendance[],
): Map<string, Attendance[]> {
  const map = new Map<string, Attendance[]>();
  for (const row of rows) {
    const bucket = map.get(row.dateKey);
    if (bucket) bucket.push(row);
    else map.set(row.dateKey, [row]);
  }
  return map;
}

/**
 * The rolling window the strip shows: today plus the next `days - 1`.
 * Two to three weeks is the horizon anyone actually plans a boat over.
 */
export const STRIP_DAYS = 21;

export function stripDates(from: string, days: number = STRIP_DAYS): string[] {
  return Array.from({ length: days }, (_, index) => addDaysToKey(from, index));
}
