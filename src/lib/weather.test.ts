import { describe, expect, it } from "vitest";
import {
  CALM_GUST_KN,
  calmWindow,
  dailyVerdict,
  formatWindow,
  type DailyForecast,
  type HourReading,
} from "./weather";

/**
 * Hours from a compact "hour: gust" map. Wind is not what any of this reads,
 * so it is left at a nominal third of the gust — roughly the ratio this coast
 * actually runs at.
 */
function hours(gusts: Record<number, number>): HourReading[] {
  return Object.entries(gusts)
    .map(([hour, gust]) => ({
      hour: Number(hour),
      windGustKn: gust,
      windSpeedKn: Math.round(gust / 3),
    }))
    .sort((a, b) => a.hour - b.hour);
}

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
    expect(dailyVerdict(day({ weatherCode: 95 })).tone).toBe("poor");
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
