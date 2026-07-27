import { describe, expect, it } from "vitest";
import {
  agorotToShekelInput,
  daysUntil,
  expiryState,
  formatAgorot,
  formatAgorotAbs,
  formatFileSize,
  formatRelativeDays,
  parseShekelInput,
  toDate,
  toDateInput,
} from "./format";

// The suite runs in America/Los_Angeles (see vitest.config.ts) so that
// UTC-midnight date bugs fail loudly instead of hiding behind Israel's UTC+3.
describe("toDate", () => {
  it("reads a Postgres date as LOCAL midnight, not UTC", () => {
    const date = toDate("2026-07-01");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6); // July
    expect(date.getDate()).toBe(1); // would be June 30 if parsed as UTC
    expect(date.getHours()).toBe(0);
  });

  it("keeps the calendar month for a first-of-month date", () => {
    // The bug this guards: an expense dated the 1st being bucketed into the
    // previous month on the finances screen.
    expect(toDate("2026-01-01").getMonth()).toBe(0);
    expect(toDate("2026-12-01").getMonth()).toBe(11);
  });

  it("leaves full timestamps to the standard parser", () => {
    const date = toDate("2026-07-01T12:30:00Z");
    expect(date.toISOString()).toBe("2026-07-01T12:30:00.000Z");
  });

  it("passes Date objects straight through", () => {
    const original = new Date(2026, 6, 1);
    expect(toDate(original)).toBe(original);
  });
});

describe("daysUntil", () => {
  const now = new Date(2026, 6, 27); // 27 July 2026, local

  it("counts whole calendar days", () => {
    expect(daysUntil("2026-07-27", now)).toBe(0);
    expect(daysUntil("2026-07-28", now)).toBe(1);
    expect(daysUntil("2026-08-06", now)).toBe(10);
    expect(daysUntil("2026-07-20", now)).toBe(-7);
  });

  it("does not drift across a month boundary", () => {
    expect(daysUntil("2026-08-01", now)).toBe(5);
  });
});

describe("formatRelativeDays", () => {
  const now = new Date(2026, 6, 27);

  it("uses Hebrew wording", () => {
    expect(formatRelativeDays("2026-07-27", now)).toBe("היום");
    expect(formatRelativeDays("2026-07-28", now)).toBe("מחר");
    expect(formatRelativeDays("2026-07-26", now)).toBe("אתמול");
    expect(formatRelativeDays("2026-08-08", now)).toBe("בעוד 12 ימים");
    expect(formatRelativeDays("2026-07-24", now)).toBe("לפני 3 ימים");
  });
});

describe("expiryState", () => {
  const now = new Date(2026, 6, 27);

  it("classifies against the reminder window", () => {
    expect(expiryState("2026-09-30", 30, now)).toBe("valid");
    expect(expiryState("2026-08-10", 30, now)).toBe("soon");
    expect(expiryState("2026-07-01", 30, now)).toBe("expired");
    expect(expiryState(null, 30, now)).toBeNull();
  });

  it("treats the boundary day as still upcoming, not expired", () => {
    expect(expiryState("2026-07-27", 30, now)).toBe("soon");
  });
});

describe("money formatting", () => {
  it("drops agorot when they are zero", () => {
    expect(formatAgorot(240000)).toBe("₪2,400");
    expect(formatAgorot(0)).toBe("₪0");
  });

  it("shows agorot when they are not", () => {
    expect(formatAgorot(240050)).toBe("₪2,400.50");
  });

  it("keeps the sign outside the symbol", () => {
    expect(formatAgorot(-124000)).toBe("-₪1,240");
    expect(formatAgorotAbs(-124000)).toBe("₪1,240");
  });
});

describe("parseShekelInput", () => {
  it("accepts what people actually type", () => {
    expect(parseShekelInput("2400")).toBe(240000);
    expect(parseShekelInput("2,400")).toBe(240000);
    expect(parseShekelInput("₪2400")).toBe(240000);
    expect(parseShekelInput(" 2400.5 ")).toBe(240050);
  });

  it("rounds to whole agorot rather than carrying a float", () => {
    expect(parseShekelInput("0.005")).toBe(1);
    expect(Number.isInteger(parseShekelInput("19.99")!)).toBe(true);
    expect(parseShekelInput("19.99")).toBe(1999);
  });

  it("rejects junk and negatives", () => {
    expect(parseShekelInput("")).toBeNull();
    expect(parseShekelInput("abc")).toBeNull();
    expect(parseShekelInput("-50")).toBeNull();
  });

  it("round-trips through agorotToShekelInput", () => {
    for (const agorot of [0, 1, 99, 100, 1999, 240000, 123456]) {
      expect(parseShekelInput(agorotToShekelInput(agorot))).toBe(agorot);
    }
  });
});

describe("toDateInput", () => {
  it("emits local yyyy-mm-dd, not a UTC-shifted day", () => {
    // Late evening local is already the next day in UTC — the naive
    // toISOString().slice(0,10) approach would be off by one here.
    expect(toDateInput(new Date(2026, 6, 27, 23, 30))).toBe("2026-07-27");
    expect(toDateInput(new Date(2026, 0, 5, 0, 15))).toBe("2026-01-05");
  });

  it("round-trips with toDate", () => {
    const input = toDateInput(new Date(2026, 6, 27));
    expect(toDate(input).getDate()).toBe(27);
  });
});

describe("formatFileSize", () => {
  it("scales units", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatFileSize(0)).toBe("");
    expect(formatFileSize(null)).toBe("");
  });
});
