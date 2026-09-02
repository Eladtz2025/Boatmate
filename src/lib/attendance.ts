import { ISRAEL_TZ, addDaysToKey, zonedDateKey, zonedHour, zonedTimeToUtc } from "./tz";

/**
 * "Who is coming to the boat, and when?"
 *
 * Attendance is not a new table. It is an `events` row with `kind = 'arrival'`
 * and a `user_id` — the same rows the home screen's arrival tile and the
 * calendar agenda have always read. That is deliberate: the boat already has
 * one place where "somebody is on the boat that day" lives, and a parallel
 * table would have meant two answers to the same question.
 *
 * A day is offered as three segments a partner picks freely — morning, midday,
 * night — rather than one either/or. "ליום או לינה" could not say "I am coming
 * after lunch and sleeping over", which is most of how this boat is actually
 * used. The hours are Israel wall-clock and are resolved through `lib/tz.ts`;
 * storing them naively would file an 08:00 arrival under the previous day for
 * anyone reading from a UTC server.
 */

export type Segment = "morning" | "noon" | "night";

/**
 * The three segments, in the order a day runs. Contiguous by construction:
 * each one starts where the last ended, so any run of them is a single
 * unbroken stretch of time.
 */
export const SEGMENTS = [
  {
    key: "morning",
    label: "בוקר",
    clock: "08:00–12:00",
    fromHour: 8,
    toHour: 12,
    /** Whether `toHour` lands on the following calendar day. */
    endsNextDay: false,
  },
  {
    key: "noon",
    label: "צהריים",
    clock: "12:00–20:00",
    fromHour: 12,
    toHour: 20,
    endsNextDay: false,
  },
  {
    key: "night",
    label: "לינה",
    clock: "20:00–08:00",
    fromHour: 20,
    toHour: 8,
    endsNextDay: true,
  },
] as const satisfies ReadonlyArray<{
  key: Segment;
  label: string;
  clock: string;
  fromHour: number;
  toHour: number;
  endsNextDay: boolean;
}>;

const ORDER: Segment[] = SEGMENTS.map((segment) => segment.key);

export const segmentMeta = (key: Segment) =>
  SEGMENTS.find((segment) => segment.key === key) ?? SEGMENTS[0];

export const SEGMENT_LABEL: Record<Segment, string> = {
  morning: "בוקר",
  noon: "צהריים",
  night: "לינה",
};

/** Day order, deduped. Every other function here assumes this shape. */
export function sortSegments(segments: readonly Segment[]): Segment[] {
  return ORDER.filter((key) => segments.includes(key));
}

export type Attendance = {
  /** The `events` row id — what an edit or a cancel addresses. */
  eventId: string;
  userId: string;
  /** Israel calendar date the stay starts on, "2026-09-05". */
  dateKey: string;
  /** Always in day order, never empty. */
  segments: Segment[];
};

/* -------------------------------------------------------------------------- */
/* Storing a selection                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The chosen segments, written into the event's `notes`.
 *
 * The dates alone cannot always carry this. A run of segments is a single
 * interval and reads back exactly from its two ends — but "בוקר + לינה", with
 * the afternoon left out, spans 08:00 to 08:00 and is indistinguishable from
 * all three. A calendar event is one interval and cannot express the gap, so
 * the interval spans the selection and this note records what was actually
 * picked. `notes` is otherwise untouched on attendance rows, and a row without
 * one still reads back sensibly — see `segmentsOf`.
 */
const NOTE_PREFIX = "boatmate:segments=";

export function segmentsNote(segments: readonly Segment[]): string {
  return `${NOTE_PREFIX}${sortSegments(segments).join(",")}`;
}

/** Null when this row carries no marker — a legacy row, or somebody's prose. */
export function parseSegmentsNote(notes: string | null | undefined): Segment[] | null {
  if (!notes) return null;

  const line = notes
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.startsWith(NOTE_PREFIX));
  if (!line) return null;

  const parsed = line
    .slice(NOTE_PREFIX.length)
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is Segment => ORDER.includes(part as Segment));

  const segments = sortSegments(parsed);
  return segments.length > 0 ? segments : null;
}

/* -------------------------------------------------------------------------- */
/* Times                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The instants a selection occupies, as ISO strings for Postgres.
 *
 * First segment's start to last segment's end. For a contiguous selection —
 * which is every case anyone actually picks — that is exactly the stretch of
 * time chosen, stored as one continuous interval. A selection with a hole in
 * it (morning and night, no afternoon) is stored as the span that covers it,
 * because one event is one interval; the note keeps the real answer and the
 * card prints it.
 */
export function attendanceWindow(
  dateKey: string,
  segments: readonly Segment[],
  timeZone: string = ISRAEL_TZ,
): { startsAt: string; endsAt: string } {
  const chosen = sortSegments(segments);
  if (chosen.length === 0) {
    throw new Error("attendanceWindow needs at least one segment");
  }

  const first = segmentMeta(chosen[0]);
  const last = segmentMeta(chosen[chosen.length - 1]);

  const startsAt = zonedTimeToUtc(dateKey, first.fromHour, 0, timeZone).toISOString();
  const endsAt = zonedTimeToUtc(
    last.endsNextDay ? addDaysToKey(dateKey, 1) : dateKey,
    last.toHour,
    0,
    timeZone,
  ).toISOString();

  return { startsAt, endsAt };
}

/**
 * Read a selection back off a row.
 *
 * The note is the truth when there is one. Without it the row is either from
 * before segments existed or was booked through the full event form, and the
 * two ends are all there is to go on — so the run they imply is reconstructed:
 *
 *   08:00 → 20:00        the old "ליום"      → morning + noon
 *   08:00 → next morning the old "לינה"      → morning + noon + night
 *   a stay spanning days  the event form      → the whole day it starts on
 *
 * Falling back this way is what keeps existing attendance readable rather than
 * blank, and it never invents a shorter stay than the row records.
 */
export function segmentsOf(
  startsAt: string,
  endsAt: string | null | undefined,
  notes?: string | null,
  timeZone: string = ISRAEL_TZ,
): Segment[] {
  const noted = parseSegmentsNote(notes);
  if (noted) return noted;

  const startKey = zonedDateKey(startsAt, timeZone);
  const startHour = zonedHour(startsAt, timeZone);

  const first: Segment =
    startHour < SEGMENTS[1].fromHour
      ? "morning"
      : startHour < SEGMENTS[2].fromHour
        ? "noon"
        : "night";

  if (!endsAt) return [first];

  const endKey = zonedDateKey(endsAt, timeZone);
  const endHour = zonedHour(endsAt, timeZone);

  // Anything finishing on a later calendar day ran through the night.
  const last: Segment =
    endKey > startKey
      ? "night"
      : endHour <= SEGMENTS[1].fromHour
        ? "morning"
        : endHour <= SEGMENTS[2].fromHour
          ? "noon"
          : "night";

  const from = ORDER.indexOf(first);
  const to = ORDER.indexOf(last);
  return to < from ? [first] : ORDER.slice(from, to + 1);
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

/** "בוקר · לינה" — what was picked, in day order. */
export function segmentsLabel(segments: readonly Segment[]): string {
  return sortSegments(segments)
    .map((key) => SEGMENT_LABEL[key])
    .join(" · ");
}

/**
 * "08:00–20:00", or "12:00–08:00 למחרת" when it runs past midnight.
 *
 * The span, so a selection with a hole in it reads as the stretch it was
 * stored as — the segment labels beside it are what say which parts of that
 * stretch were actually chosen.
 */
export function segmentsRangeLabel(segments: readonly Segment[]): string {
  const chosen = sortSegments(segments);
  if (chosen.length === 0) return "";

  const first = segmentMeta(chosen[0]);
  const last = segmentMeta(chosen[chosen.length - 1]);
  const pad = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

  const range = `${pad(first.fromHour)}–${pad(last.toHour)}`;
  return last.endsNextDay ? `${range} למחרת` : range;
}

/** True when the run has no gap — every case the segment picker offers but one. */
export function isContiguous(segments: readonly Segment[]): boolean {
  const chosen = sortSegments(segments);
  if (chosen.length < 2) return true;
  const from = ORDER.indexOf(chosen[0]);
  const to = ORDER.indexOf(chosen[chosen.length - 1]);
  return to - from + 1 === chosen.length;
}

/* -------------------------------------------------------------------------- */
/* Windows and grouping                                                       */
/* -------------------------------------------------------------------------- */

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
export function groupByDate(rows: Attendance[]): Map<string, Attendance[]> {
  const map = new Map<string, Attendance[]>();
  for (const row of rows) {
    const bucket = map.get(row.dateKey);
    if (bucket) bucket.push(row);
    else map.set(row.dateKey, [row]);
  }
  return map;
}

/**
 * How many days the strip reveals at a time — the block it opens on, and the
 * block each "+" appends. Three weeks is the horizon anyone actually plans a
 * boat over; beyond that they are reaching, which is what the "+" is for.
 */
export const STRIP_DAYS = 21;

/**
 * How far ahead attendance is read, and therefore how far the "+" can go.
 *
 * The strip only *renders* `STRIP_DAYS` at a time, but the data behind it is
 * fetched once out to here — revealing a further block must not need a round
 * trip, and a day showing "nobody" because its data was never fetched would be
 * the same lie as an empty expense list. A year of attendance on this boat is
 * a few dozen rows.
 */
export const STRIP_HORIZON_DAYS = 364;

export function stripDates(from: string, days: number = STRIP_DAYS): string[] {
  return Array.from({ length: days }, (_, index) => addDaysToKey(from, index));
}
