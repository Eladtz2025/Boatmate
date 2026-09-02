import { describe, expect, it } from "vitest";
import {
  SEGMENTS,
  attendanceWindow,
  dayRange,
  groupByDate,
  isContiguous,
  parseSegmentsNote,
  segmentsLabel,
  segmentsNote,
  segmentsOf,
  segmentsRangeLabel,
  sortSegments,
  stripDates,
  type Attendance,
  type Segment,
} from "./attendance";
import { addDaysToKey, zonedDateKey, zonedHour, zonedTimeToUtc } from "./tz";

/**
 * Attendance has one job that must never drift: a date and a stretch of hours
 * a partner tapped in Israel have to come back as the same date and the same
 * hours, on a server running in UTC, in both halves of the year. Everything
 * else here is bookkeeping around that.
 */

const DAY = "2026-09-05";

/** The Israel wall-clock ends of a stored window, as "08:00"→"20:00" plus a
 *  flag for whether it finished on the following day. */
function windowClock(segments: Segment[], dateKey = DAY) {
  const { startsAt, endsAt } = attendanceWindow(dateKey, segments);
  return {
    from: zonedHour(startsAt),
    to: zonedHour(endsAt),
    startsOn: zonedDateKey(startsAt),
    endsOn: zonedDateKey(endsAt),
  };
}

describe("zonedTimeToUtc", () => {
  it("resolves summer time (UTC+3)", () => {
    // 08:00 IDT on 5 September is 05:00Z.
    expect(zonedTimeToUtc("2026-09-05", 8).toISOString()).toBe(
      "2026-09-05T05:00:00.000Z",
    );
  });

  it("resolves winter time (UTC+2)", () => {
    // 08:00 IST on 5 January is 06:00Z. Getting this wrong by the DST hour is
    // how an early booking lands on the previous day.
    expect(zonedTimeToUtc("2026-01-05", 8).toISOString()).toBe(
      "2026-01-05T06:00:00.000Z",
    );
  });

  it("round-trips midnight back to its own date", () => {
    for (const date of ["2026-01-01", "2026-03-27", "2026-06-15", "2026-10-25"]) {
      expect(zonedDateKey(zonedTimeToUtc(date, 0))).toBe(date);
      expect(zonedDateKey(zonedTimeToUtc(date, 23))).toBe(date);
    }
  });
});

describe("addDaysToKey", () => {
  it("crosses a month boundary", () => {
    expect(addDaysToKey("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("crosses a year boundary", () => {
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("SEGMENTS", () => {
  it("covers a whole day end to end with no gap", () => {
    // Each segment starts where the last finished, which is what makes any run
    // of them a single unbroken interval.
    expect(SEGMENTS[0].fromHour).toBe(8);
    expect(SEGMENTS[0].toHour).toBe(SEGMENTS[1].fromHour);
    expect(SEGMENTS[1].toHour).toBe(SEGMENTS[2].fromHour);
    expect(SEGMENTS[2].toHour).toBe(SEGMENTS[0].fromHour);
    expect(SEGMENTS[2].endsNextDay).toBe(true);
  });
});

describe("sortSegments", () => {
  it("puts a selection into day order whatever order it was tapped in", () => {
    expect(sortSegments(["night", "morning"])).toEqual(["morning", "night"]);
    expect(sortSegments(["noon", "morning", "night"])).toEqual([
      "morning",
      "noon",
      "night",
    ]);
  });

  it("drops duplicates", () => {
    expect(sortSegments(["noon", "noon"])).toEqual(["noon"]);
  });
});

describe("attendanceWindow", () => {
  it("stores each single segment as its own hours", () => {
    expect(windowClock(["morning"])).toEqual({
      from: 8,
      to: 12,
      startsOn: DAY,
      endsOn: DAY,
    });
    expect(windowClock(["noon"])).toEqual({
      from: 12,
      to: 20,
      startsOn: DAY,
      endsOn: DAY,
    });
    expect(windowClock(["night"])).toEqual({
      from: 20,
      to: 8,
      startsOn: DAY,
      endsOn: addDaysToKey(DAY, 1),
    });
  });

  it("joins a run into one continuous interval", () => {
    // בוקר + צהריים → 08:00-20:00, not two events.
    expect(windowClock(["morning", "noon"])).toEqual({
      from: 8,
      to: 20,
      startsOn: DAY,
      endsOn: DAY,
    });
    // צהריים + לינה → 12:00 through to the next morning.
    expect(windowClock(["noon", "night"])).toEqual({
      from: 12,
      to: 8,
      startsOn: DAY,
      endsOn: addDaysToKey(DAY, 1),
    });
    // All three → a full 24 hours.
    expect(windowClock(["morning", "noon", "night"])).toEqual({
      from: 8,
      to: 8,
      startsOn: DAY,
      endsOn: addDaysToKey(DAY, 1),
    });
  });

  it("does not care what order the segments arrive in", () => {
    expect(attendanceWindow(DAY, ["night", "noon"])).toEqual(
      attendanceWindow(DAY, ["noon", "night"]),
    );
  });

  it("spans a selection with a hole in it", () => {
    // One event is one interval, so בוקר + לינה is stored as the span it
    // covers. `segmentsNote` is what remembers the afternoon was not chosen.
    expect(windowClock(["morning", "night"])).toEqual({
      from: 8,
      to: 8,
      startsOn: DAY,
      endsOn: addDaysToKey(DAY, 1),
    });
  });

  it("refuses an empty selection rather than inventing a window", () => {
    expect(() => attendanceWindow(DAY, [])).toThrow();
  });

  it("survives the spring clock change", () => {
    // Israel springs forward on the Friday before the last Sunday of March.
    const { startsAt, endsAt } = attendanceWindow("2026-03-26", ["night"]);
    expect(zonedDateKey(startsAt)).toBe("2026-03-26");
    expect(zonedDateKey(endsAt)).toBe("2026-03-27");
    expect(zonedHour(startsAt)).toBe(20);
    expect(zonedHour(endsAt)).toBe(8);
  });
});

describe("segmentsNote", () => {
  it("round-trips a selection", () => {
    for (const segments of [
      ["morning"],
      ["noon"],
      ["night"],
      ["morning", "noon"],
      ["noon", "night"],
      ["morning", "night"],
      ["morning", "noon", "night"],
    ] as Segment[][]) {
      expect(parseSegmentsNote(segmentsNote(segments))).toEqual(segments);
    }
  });

  it("normalises order on the way in", () => {
    expect(parseSegmentsNote(segmentsNote(["night", "morning"]))).toEqual([
      "morning",
      "night",
    ]);
  });

  it("ignores notes that are not ours", () => {
    expect(parseSegmentsNote("להביא מים")).toBeNull();
    expect(parseSegmentsNote(null)).toBeNull();
    expect(parseSegmentsNote("")).toBeNull();
  });

  it("finds the marker among other lines", () => {
    expect(
      parseSegmentsNote(`להביא מים\n${segmentsNote(["noon"])}\nותודה`),
    ).toEqual(["noon"]);
  });

  it("drops values it does not recognise", () => {
    expect(parseSegmentsNote("boatmate:segments=noon,teatime")).toEqual(["noon"]);
    expect(parseSegmentsNote("boatmate:segments=teatime")).toBeNull();
  });
});

describe("segmentsOf", () => {
  it("reads back exactly what was written", () => {
    for (const segments of [
      ["morning"],
      ["noon"],
      ["night"],
      ["morning", "noon"],
      ["noon", "night"],
      ["morning", "night"],
      ["morning", "noon", "night"],
    ] as Segment[][]) {
      const { startsAt, endsAt } = attendanceWindow(DAY, segments);
      expect(segmentsOf(startsAt, endsAt, segmentsNote(segments))).toEqual(segments);
    }
  });

  it("prefers the note over the dates, which is the point of having it", () => {
    // The stored span is the full day; the note says the afternoon was not.
    const { startsAt, endsAt } = attendanceWindow(DAY, ["morning", "night"]);
    expect(segmentsOf(startsAt, endsAt, segmentsNote(["morning", "night"]))).toEqual([
      "morning",
      "night",
    ]);
    // Without it the same row can only read as the run it spans.
    expect(segmentsOf(startsAt, endsAt, null)).toEqual([
      "morning",
      "noon",
      "night",
    ]);
  });

  it("reads a legacy 08:00-20:00 day as morning + noon", () => {
    // What "ליום" used to write, before segments existed.
    const startsAt = zonedTimeToUtc(DAY, 8).toISOString();
    const endsAt = zonedTimeToUtc(DAY, 20).toISOString();
    expect(segmentsOf(startsAt, endsAt, null)).toEqual(["morning", "noon"]);
  });

  it("reads a legacy overnight as the whole day and the night", () => {
    // What "לינה" used to write: 08:00 through to 10:00 the next morning.
    const startsAt = zonedTimeToUtc(DAY, 8).toISOString();
    const endsAt = zonedTimeToUtc(addDaysToKey(DAY, 1), 10).toISOString();
    expect(segmentsOf(startsAt, endsAt, null)).toEqual([
      "morning",
      "noon",
      "night",
    ]);
  });

  it("reads a multi-day stay from the full event form", () => {
    const startsAt = zonedTimeToUtc(DAY, 9).toISOString();
    const endsAt = zonedTimeToUtc(addDaysToKey(DAY, 7), 17).toISOString();
    expect(segmentsOf(startsAt, endsAt, null)).toEqual([
      "morning",
      "noon",
      "night",
    ]);
  });

  it("treats an open-ended row as the segment it starts in", () => {
    expect(segmentsOf(zonedTimeToUtc(DAY, 13).toISOString(), null)).toEqual(["noon"]);
    expect(segmentsOf(zonedTimeToUtc(DAY, 21).toISOString(), null)).toEqual(["night"]);
  });

  it("never returns nothing", () => {
    // An end before its start is nonsense, but a blank row on the strip is
    // worse than an approximate one.
    const startsAt = zonedTimeToUtc(DAY, 20).toISOString();
    const endsAt = zonedTimeToUtc(DAY, 9).toISOString();
    expect(segmentsOf(startsAt, endsAt, null)).toEqual(["night"]);
  });
});

describe("isContiguous", () => {
  it("accepts every run", () => {
    expect(isContiguous(["morning"])).toBe(true);
    expect(isContiguous(["morning", "noon"])).toBe(true);
    expect(isContiguous(["noon", "night"])).toBe(true);
    expect(isContiguous(["morning", "noon", "night"])).toBe(true);
  });

  it("rejects the one selection with a hole in it", () => {
    expect(isContiguous(["morning", "night"])).toBe(false);
  });
});

describe("labels", () => {
  it("names the parts in day order", () => {
    expect(segmentsLabel(["night", "morning"])).toBe("בוקר · לינה");
    expect(segmentsLabel(["morning", "noon", "night"])).toBe("בוקר · צהריים · לינה");
  });

  it("gives the clock range, and says when it runs past midnight", () => {
    expect(segmentsRangeLabel(["morning"])).toBe("08:00–12:00");
    expect(segmentsRangeLabel(["morning", "noon"])).toBe("08:00–20:00");
    expect(segmentsRangeLabel(["noon", "night"])).toBe("12:00–08:00 למחרת");
    expect(segmentsRangeLabel([])).toBe("");
  });
});

describe("dayRange", () => {
  it("covers exactly one Israel calendar day", () => {
    const { from, to } = dayRange(DAY);
    expect(zonedDateKey(from)).toBe(DAY);
    // Half-open: the end is the next day's midnight and must not be included.
    expect(zonedDateKey(to)).toBe(addDaysToKey(DAY, 1));
  });

  it("contains every selection that starts on that day", () => {
    // The lookup `setAttendance` uses to find an existing row must match what
    // every segment combination writes, or an edit inserts a second row.
    const { from, to } = dayRange(DAY);
    for (const segments of [
      ["morning"],
      ["noon"],
      ["night"],
      ["morning", "noon"],
      ["noon", "night"],
      ["morning", "noon", "night"],
    ] as Segment[][]) {
      const { startsAt } = attendanceWindow(DAY, segments);
      expect(startsAt >= from && startsAt < to).toBe(true);
    }
  });
});

describe("stripDates", () => {
  it("starts on the given day and runs consecutively", () => {
    expect(stripDates("2026-09-05", 4)).toEqual([
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
    ]);
  });
});

describe("groupByDate", () => {
  const rows: Attendance[] = [
    { eventId: "a", userId: "u1", dateKey: "2026-09-05", segments: ["morning"] },
    { eventId: "b", userId: "u2", dateKey: "2026-09-05", segments: ["night"] },
    { eventId: "c", userId: "u1", dateKey: "2026-09-06", segments: ["noon"] },
  ];

  it("buckets a day's attendance together", () => {
    const byDate = groupByDate(rows);
    expect(byDate.get("2026-09-05")).toHaveLength(2);
    expect(byDate.get("2026-09-06")).toHaveLength(1);
    expect(byDate.get("2026-09-07")).toBeUndefined();
  });
});
