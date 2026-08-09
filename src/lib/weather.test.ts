import { describe, expect, it } from "vitest";
import {
  CALM_GUST_KN,
  calmWindow,
  conditionSpell,
  dailyVerdict,
  dayCondition,
  formatWindow,
  severeCondition,
  type DailyForecast,
  type HourReading,
} from "./weather";

/**
 * Hours from a compact "hour: gust" map. Wind is not what any of this reads,
 * so it is left at a nominal third of the gust — roughly the ratio this coast
 * actually runs at. Weather is clear unless a test says otherwise.
 */
function hours(gusts: Record<number, number>): HourReading[] {
  return Object.entries(gusts)
    .map(([hour, gust]) => ({
      hour: Number(hour),
      windGustKn: gust,
      windSpeedKn: Math.round(gust / 3),
      weatherCode: 0,
    }))
    .sort((a, b) => a.hour - b.hour);
}

/** Hours from a compact "hour: WMO code" map. Wind is flat and calm. */
function sky(codes: Record<number, number>): HourReading[] {
  return Object.entries(codes)
    .map(([hour, weatherCode]) => ({
      hour: Number(hour),
      windGustKn: 5,
      windSpeedKn: 2,
      weatherCode,
    }))
    .sort((a, b) => a.hour - b.hour);
}

/** Thirteen daylight hours, 07:00–19:00, all carrying the same code. */
const allDay = (code: number): HourReading[] =>
  sky(Object.fromEntries(Array.from({ length: 13 }, (_, i) => [i + 7, code])));

/** The shape that started this: dawn fog under an otherwise clear day. */
const FOGGY_DAWN = sky({
  7: 45, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 13: 1,
  14: 1, 15: 0, 16: 0, 17: 0, 18: 0, 19: 0,
});

/** A real Tel Aviv summer day: glass until noon, sea breeze until sunset. */
const SEA_BREEZE = hours({
  6: 4,
  7: 6,
  8: 8,
  9: 10,
  10: 13,
  11: 14,
  12: 17,
  13: 20,
  14: 22,
  15: 22,
  16: 21,
  17: 19,
  18: 18,
  19: 11,
  20: 4,
});

function day(overrides: Partial<DailyForecast> = {}): DailyForecast {
  return {
    date: "2026-07-29",
    weatherCode: 2,
    severeCode: 2,
    tempMax: 31,
    tempMin: 24,
    windMinKn: 1,
    windMaxKn: 8,
    gustMinKn: 4,
    gustMaxKn: 22,
    windDirection: 270,
    waveHeight: 0.6,
    wavePeriod: 6,
    sunrise: null,
    sunset: null,
    hours: SEA_BREEZE,
    ...overrides,
  };
}

describe("calmWindow", () => {
  it("ends the window at the first gusty hour", () => {
    // 06:00–11:00 are under the limit; 12:00 is the first that is not, so the
    // window is "out from six, back by twelve".
    expect(calmWindow(SEA_BREEZE)).toEqual({ fromHour: 6, toHour: 12 });
  });

  it("prefers the longest run, not the first", () => {
    const evening = hours({ 6: 20, 7: 4, 8: 20, 9: 4, 10: 4, 11: 4, 12: 20 });
    expect(calmWindow(evening)).toEqual({ fromHour: 9, toHour: 12 });
  });

  it("runs to the end of the day when it never picks up", () => {
    expect(calmWindow(hours({ 6: 4, 7: 5, 8: 6 }))).toEqual({
      fromHour: 6,
      toHour: 9,
    });
  });

  it("is null when the gusts never drop", () => {
    expect(calmWindow(hours({ 6: 20, 7: 22, 8: 25 }))).toBeNull();
  });

  it("is null with no hours at all", () => {
    expect(calmWindow([])).toBeNull();
  });

  it("does not bridge a gap in the hourly series", () => {
    // 10:00 missing entirely — 06:00–09:00 and 11:00–12:00 are separate runs.
    const gapped = hours({ 6: 4, 7: 4, 8: 4, 9: 4, 11: 4, 12: 4 });
    expect(calmWindow(gapped)).toEqual({ fromHour: 6, toHour: 10 });
  });

  it("takes the limit as an argument", () => {
    // Raise the bar past the sea breeze peak and the whole day is sailable.
    expect(calmWindow(SEA_BREEZE, 25)).toEqual({ fromHour: 6, toHour: 21 });
  });

  it("uses a limit the sea breeze actually crosses", () => {
    // Guards the fixture rather than the function: if CALM_GUST_KN moved past
    // this day's peak, every test above would pass for the wrong reason.
    expect(CALM_GUST_KN).toBeLessThan(22);
  });
});

describe("dayCondition", () => {
  it("does not let one foggy hour name a clear day", () => {
    // The bug this exists for: Open-Meteo's daily code is the day's most severe
    // hour, so 30.7 — ten daylight hours of clear sky — came back as 45 and the
    // card headlined a 32° August day "ערפל", in amber, with a fog icon.
    expect(dayCondition(FOGGY_DAWN)).toBe(0);
  });

  it("still names weather that holds for a real part of the day", () => {
    // Six hours of rain out of thirteen is what the day was, not a footnote.
    const wet = sky({
      7: 0, 8: 0, 9: 0, 10: 61, 11: 61, 12: 61,
      13: 61, 14: 61, 15: 61, 16: 3, 17: 3, 18: 0, 19: 0,
    });
    expect(dayCondition(wet)).toBe(61);
  });

  it("counts hours by what the card would print, not by raw code", () => {
    // 1 and 2 are both "מעונן חלקית". Neither clears a quarter of the day
    // alone; together they are over half of it, and calling this day clear
    // would be the same mistake in the other direction.
    const hazy = sky({
      7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 1,
      13: 1, 14: 1, 15: 1, 16: 2, 17: 2, 18: 2, 19: 2,
    });
    expect(dayCondition(hazy)).toBe(2);
  });

  it("takes the severest of the conditions that do hold", () => {
    const mixed = sky({
      7: 0, 8: 0, 9: 0, 10: 0, 11: 3, 12: 3,
      13: 3, 14: 3, 15: 61, 16: 61, 17: 61, 18: 61, 19: 0,
    });
    expect(dayCondition(mixed)).toBe(61);
  });

  it("falls back to the commonest when the day is too mixed for anything to hold", () => {
    const jumble = sky({ 7: 0, 8: 0, 9: 0, 10: 3, 11: 3, 12: 45, 13: 51, 14: 61, 15: 71, 16: 80, 17: 95, 18: 1, 19: 2 });
    // Nothing reaches a quarter; "בהיר" is three of thirteen and the largest.
    expect(dayCondition(jumble)).toBe(0);
  });

  it("is clear-by-default with no hours at all", () => {
    expect(dayCondition([])).toBe(0);
  });

  it("leaves an unbroken day alone", () => {
    expect(dayCondition(allDay(3))).toBe(3);
  });
});

describe("severeCondition", () => {
  it("finds the worst hour", () => {
    expect(severeCondition(FOGGY_DAWN)).toBe(45);
  });

  it("is clear-by-default with no hours at all", () => {
    expect(severeCondition([])).toBe(0);
  });
});

describe("conditionSpell", () => {
  it("says when the weather the headline dropped actually fell", () => {
    expect(conditionSpell(FOGGY_DAWN, 45)).toEqual({ fromHour: 7, toHour: 8 });
  });

  it("spans from the first matching hour to the last", () => {
    const wet = sky({ 7: 0, 8: 61, 9: 0, 10: 63, 11: 0, 12: 0, 13: 0 });
    // 61 and 63 are both "גשם", so the spell covers the whole wet stretch.
    expect(conditionSpell(wet, 61)).toEqual({ fromHour: 8, toHour: 11 });
  });

  it("is null when the condition never appears", () => {
    expect(conditionSpell(FOGGY_DAWN, 95)).toBeNull();
  });

  it("is null when it is the whole day — the headline already said so", () => {
    expect(conditionSpell(allDay(45), 45)).toBeNull();
  });
});

describe("formatWindow", () => {
  it("reads as a pair of clock times", () => {
    expect(formatWindow({ fromHour: 6, toHour: 12 })).toBe("06:00–12:00");
  });

  it("does not print a 24th hour", () => {
    expect(formatWindow({ fromHour: 21, toHour: 24 })).toBe("21:00–00:00");
  });
});

describe("dailyVerdict", () => {
  it("calls a day with a long calm morning good", () => {
    // The point of the whole exercise: a blowy afternoon does not condemn the
    // day, because the morning is six hours of glass.
    expect(dailyVerdict(day())).toEqual({
      label: "יש חלון טוב להפלגה",
      tone: "good",
    });
  });

  it("warns when the window is too short to be worth it", () => {
    expect(dailyVerdict(day({ hours: hours({ 6: 4, 7: 4, 8: 20, 9: 22 }) })).tone).toBe(
      "caution",
    );
  });

  it("warns when the day never settles", () => {
    expect(dailyVerdict(day({ hours: hours({ 6: 20, 7: 22, 8: 25 }) }))).toEqual({
      label: "משבים לאורך כל היום",
      tone: "caution",
    });
  });

  it("lets a storm override an otherwise calm day", () => {
    expect(dailyVerdict(day({ severeCode: 95 })).tone).toBe("poor");
  });

  it("reads the storm off the worst hour, not off the headline", () => {
    // The whole point of splitting the two. Three hours of thunderstorm in a
    // fourteen-hour day do not get to be the day's *label* — but they very much
    // get to stop you going out, so softening one must not soften the other.
    expect(
      dailyVerdict(day({ weatherCode: 0, severeCode: 95 })).tone,
    ).toBe("poor");
  });

  it("lets a heavy sea override a calm window", () => {
    expect(dailyVerdict(day({ waveHeight: 2.4 })).tone).toBe("poor");
  });

  it("flags a short, slamming chop even when the wind is fine", () => {
    expect(dailyVerdict(day({ waveHeight: 0.8, wavePeriod: 4 })).tone).toBe(
      "caution",
    );
  });
});
