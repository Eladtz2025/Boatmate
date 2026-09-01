import { describe, expect, it } from "vitest";
import {
  CALM_GUST_KN,
  DAY_PERIODS,
  periodVerdict,
  summarisePeriod,
  type HourReading,
} from "./weather";

/**
 * The three windows a day is split into.
 *
 * The rule these tests hold to is the one the card is built on: a window is
 * summarised **from its own hours and nothing else**. A window the provider
 * has no hours for reports null everywhere — it never borrows a neighbour's
 * numbers, and it never falls back to a day-level figure, because both would
 * put a number on the screen that nobody forecast for those four hours.
 */

type Partial = {
  hour: number;
  windSpeedKn: number;
  windGustKn: number;
  weatherCode?: number;
  temperatureC?: number | null;
  waveHeight?: number | null;
  wavePeriod?: number | null;
  windDirection?: number | null;
};

const hour = (input: Partial): HourReading => ({
  weatherCode: 0,
  ...input,
});

/** A real Tel Aviv September afternoon, straight off the provider. */
const MIDDAY: HourReading[] = [
  hour({ hour: 12, windSpeedKn: 6, windGustKn: 17, temperatureC: 31.2, waveHeight: 0.32, wavePeriod: 4.15, windDirection: 280 }),
  hour({ hour: 13, windSpeedKn: 7, windGustKn: 19, temperatureC: 31.4, waveHeight: 0.32, wavePeriod: 4.05, windDirection: 285 }),
  hour({ hour: 14, windSpeedKn: 7, windGustKn: 20, temperatureC: 31.1, waveHeight: 0.32, wavePeriod: 3.9, windDirection: 290 }),
  hour({ hour: 15, windSpeedKn: 7, windGustKn: 20, temperatureC: 30.4, waveHeight: 0.34, wavePeriod: 3.75, windDirection: 295 }),
];

const CALM_MORNING: HourReading[] = [
  hour({ hour: 8, windSpeedKn: 2, windGustKn: 7, temperatureC: 26.4, waveHeight: 0.38, wavePeriod: 4.25 }),
  hour({ hour: 9, windSpeedKn: 3, windGustKn: 8, temperatureC: 27.7, waveHeight: 0.36, wavePeriod: 4.25 }),
  hour({ hour: 10, windSpeedKn: 4, windGustKn: 10, temperatureC: 29.1, waveHeight: 0.34, wavePeriod: 4.25 }),
  hour({ hour: 11, windSpeedKn: 5, windGustKn: 13, temperatureC: 30.1, waveHeight: 0.34, wavePeriod: 4.25 }),
];

describe("DAY_PERIODS", () => {
  it("covers 08:00 to 20:00 without gaps or overlaps", () => {
    expect(DAY_PERIODS[0].fromHour).toBe(8);
    expect(DAY_PERIODS.at(-1)?.toHour).toBe(20);

    for (const [index, period] of DAY_PERIODS.entries()) {
      const next = DAY_PERIODS[index + 1];
      if (next) expect(next.fromHour).toBe(period.toHour);
    }
  });
});

describe("summarisePeriod", () => {
  it("ranges wind and takes the peak gust from its own hours", () => {
    const period = summarisePeriod("midday", MIDDAY);
    expect(period.windMinKn).toBe(6);
    expect(period.windMaxKn).toBe(7);
    expect(period.gustMaxKn).toBe(20);
  });

  it("reports the window's own temperature, not the day's", () => {
    expect(summarisePeriod("morning", CALM_MORNING).tempMaxC).toBeCloseTo(30.1);
    expect(summarisePeriod("midday", MIDDAY).tempMaxC).toBeCloseTo(31.4);
  });

  it("takes the tallest wave and the shortest period in the window", () => {
    const period = summarisePeriod("midday", MIDDAY);
    expect(period.waveHeight).toBeCloseTo(0.34);
    expect(period.wavePeriod).toBeCloseTo(3.75);
  });

  it("says nothing at all when the provider had no hours", () => {
    const period = summarisePeriod("evening", []);
    expect(period.windMinKn).toBeNull();
    expect(period.windMaxKn).toBeNull();
    expect(period.gustMaxKn).toBeNull();
    expect(period.tempMaxC).toBeNull();
    expect(period.waveHeight).toBeNull();
    expect(period.weatherCode).toBeNull();
    expect(period.choppy).toBe(false);
  });

  it("leaves wave data null when only the wind series arrived", () => {
    const period = summarisePeriod(
      "morning",
      [hour({ hour: 8, windSpeedKn: 4, windGustKn: 9 })],
    );
    expect(period.waveHeight).toBeNull();
    expect(period.wavePeriod).toBeNull();
    expect(period.windMaxKn).toBe(4);
  });

  it("decides chop per hour, never from the window's two extremes", () => {
    // The tallest wave and the shortest period are different hours. Pairing
    // them would manufacture a 0.9 m sea at 3 s that nobody forecast.
    const mixed = [
      hour({ hour: 8, windSpeedKn: 5, windGustKn: 12, waveHeight: 0.9, wavePeriod: 9 }),
      hour({ hour: 9, windSpeedKn: 5, windGustKn: 12, waveHeight: 0.2, wavePeriod: 3 }),
    ];
    const period = summarisePeriod("morning", mixed);
    expect(period.waveHeight).toBeCloseTo(0.9);
    expect(period.wavePeriod).toBeCloseTo(3);
    expect(period.choppy).toBe(false);
  });

  it("flags chop when a single hour is genuinely short and steep", () => {
    const period = summarisePeriod("morning", [
      hour({ hour: 8, windSpeedKn: 5, windGustKn: 12, waveHeight: 0.9, wavePeriod: 4 }),
    ]);
    expect(period.choppy).toBe(true);
  });

  it("takes a middle direction rather than averaging across north", () => {
    // 350° and 10° average to 180° — the opposite way round the compass.
    const period = summarisePeriod("morning", [
      hour({ hour: 8, windSpeedKn: 5, windGustKn: 9, windDirection: 350 }),
      hour({ hour: 9, windSpeedKn: 5, windGustKn: 9, windDirection: 355 }),
      hour({ hour: 10, windSpeedKn: 5, windGustKn: 9, windDirection: 10 }),
    ]);
    expect(period.windDirection).toBe(355);
  });
});

describe("periodVerdict", () => {
  it("says so when there is nothing to judge", () => {
    expect(periodVerdict(summarisePeriod("evening", []))).toEqual({
      label: "אין נתונים לשעות האלה",
      tone: "caution",
    });
  });

  it("calls a calm morning a good window", () => {
    expect(periodVerdict(summarisePeriod("morning", CALM_MORNING)).tone).toBe("good");
  });

  it("warns that the wind builds inside the window rather than at its edge", () => {
    // 08:00 and 09:00 are calm, 10:00 and 11:00 are not: you go out into one
    // set of conditions and come back in another.
    const building = [
      hour({ hour: 8, windSpeedKn: 4, windGustKn: 9 }),
      hour({ hour: 9, windSpeedKn: 5, windGustKn: 13 }),
      hour({ hour: 10, windSpeedKn: 8, windGustKn: 18 }),
      hour({ hour: 11, windSpeedKn: 9, windGustKn: 21 }),
    ];
    const verdict = periodVerdict(summarisePeriod("morning", building));
    expect(verdict.tone).toBe("caution");
    expect(verdict.label).toContain("מתחזקת");
  });

  it("calls a window that never settles what it is", () => {
    const blowing = [
      hour({ hour: 12, windSpeedKn: 9, windGustKn: CALM_GUST_KN + 2 }),
      hour({ hour: 13, windSpeedKn: 10, windGustKn: CALM_GUST_KN + 5 }),
    ];
    expect(periodVerdict(summarisePeriod("midday", blowing)).label).toContain("משבים");
  });

  it("closes the window outright for a thunderstorm", () => {
    const storm = [hour({ hour: 12, windSpeedKn: 12, windGustKn: 25, weatherCode: 95 })];
    expect(periodVerdict(summarisePeriod("midday", storm)).tone).toBe("poor");
  });

  it("closes it for a heavy sea even when the wind is nothing", () => {
    const swell = [
      hour({ hour: 12, windSpeedKn: 4, windGustKn: 8, waveHeight: 2.4, wavePeriod: 10 }),
    ];
    expect(periodVerdict(summarisePeriod("midday", swell)).tone).toBe("poor");
  });

  it("does not call glass a good sail", () => {
    const glass = [
      hour({ hour: 8, windSpeedKn: 1, windGustKn: 3 }),
      hour({ hour: 9, windSpeedKn: 2, windGustKn: 4 }),
    ];
    const verdict = periodVerdict(summarisePeriod("morning", glass));
    expect(verdict.tone).toBe("caution");
    expect(verdict.label).toContain("בלי רוח");
  });
});
