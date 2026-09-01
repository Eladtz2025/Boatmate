import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_HOURS,
  attendanceWindow,
  dayRange,
  groupByDate,
  stayOf,
  stripDates,
  type Attendance,
} from "./attendance";
import { addDaysToKey, zonedDateKey, zonedTimeToUtc } from "./tz";

/**
 * Attendance has one job that must never drift: a date a partner tapped in
 * Israel has to come back as the same date, on a server running in UTC, in
 * both halves of the year. Everything else here is bookkeeping around that.
 */

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

describe("attendanceWindow", () => {
  it("gives a day stay morning to evening on one date", () => {
    const { startsAt, endsAt } = attendanceWindow("2026-09-05", "day");
    expect(zonedDateKey(startsAt)).toBe("2026-09-05");
    expect(zonedDateKey(endsAt)).toBe("2026-09-05");
    expect(new Date(endsAt).getTime()).toBeGreaterThan(new Date(startsAt).getTime());
  });

  it("carries an overnight stay into the next morning", () => {
    const { startsAt, endsAt } = attendanceWindow("2026-09-05", "overnight");
    expect(zonedDateKey(startsAt)).toBe("2026-09-05");
    expect(zonedDateKey(endsAt)).toBe("2026-09-06");
  });

  it("survives the spring clock change", () => {
    // Israel springs forward on the Friday before the last Sunday of March.
    const { startsAt, endsAt } = attendanceWindow("2026-03-26", "overnight");
    expect(zonedDateKey(startsAt)).toBe("2026-03-26");
    expect(zonedDateKey(endsAt)).toBe("2026-03-27");
  });
});

describe("stayOf", () => {
  it("reads back what attendanceWindow wrote", () => {
    for (const stay of ["day", "overnight"] as const) {
      const { startsAt, endsAt } = attendanceWindow("2026-09-05", stay);
      expect(stayOf(startsAt, endsAt)).toBe(stay);
    }
  });

  it("treats an open-ended row as a day", () => {
    expect(stayOf("2026-09-05T05:00:00.000Z", null)).toBe("day");
  });

  it("treats a multi-day stay booked in the event form as an overnight", () => {
    const start = zonedTimeToUtc("2026-09-05", 9).toISOString();
    const end = zonedTimeToUtc("2026-09-12", 17).toISOString();
    expect(stayOf(start, end)).toBe("overnight");
  });

  it("does not call a late evening an overnight", () => {
    // 23:00 to 23:59 the same day is a long day, not a night on the boat.
    const start = zonedTimeToUtc("2026-09-05", 23).toISOString();
    const end = zonedTimeToUtc("2026-09-05", 23, 59).toISOString();
    expect(stayOf(start, end)).toBe("day");
  });
});

describe("dayRange", () => {
  it("covers exactly one Israel calendar day", () => {
    const { from, to } = dayRange("2026-09-05");
    expect(zonedDateKey(from)).toBe("2026-09-05");
    // Half-open: the end is the next day's midnight and must not be included.
    expect(zonedDateKey(to)).toBe("2026-09-06");

    // An 08:00 stay on that day falls inside it — the case a naive UTC window
    // would drop, since 08:00 local is 05:00Z.
    const { startsAt } = attendanceWindow("2026-09-05", "day");
    expect(startsAt >= from && startsAt < to).toBe(true);
  });
});

describe("stripDates", () => {
  it("starts on the given day and runs consecutively", () => {
    const dates = stripDates("2026-09-05", 4);
    expect(dates).toEqual([
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
    ]);
  });
});

describe("groupByDate", () => {
  const rows: Attendance[] = [
    { eventId: "a", userId: "u1", dateKey: "2026-09-05", stay: "day" },
    { eventId: "b", userId: "u2", dateKey: "2026-09-05", stay: "overnight" },
    { eventId: "c", userId: "u1", dateKey: "2026-09-06", stay: "day" },
  ];

  it("buckets a day's attendance together", () => {
    const byDate = groupByDate(rows);
    expect(byDate.get("2026-09-05")).toHaveLength(2);
    expect(byDate.get("2026-09-06")).toHaveLength(1);
    expect(byDate.get("2026-09-07")).toBeUndefined();
  });
});

describe("ATTENDANCE_HOURS", () => {
  it("starts in the morning and ends before midnight", () => {
    expect(ATTENDANCE_HOURS.start).toBeGreaterThan(0);
    expect(ATTENDANCE_HOURS.dayEnd).toBeGreaterThan(ATTENDANCE_HOURS.start);
    expect(ATTENDANCE_HOURS.dayEnd).toBeLessThan(24);
  });
});
