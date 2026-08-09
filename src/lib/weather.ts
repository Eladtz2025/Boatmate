/** Presentation helpers for the marine conditions card. */

/**
 * The home card is pinned here rather than to the boat's own coordinates: the
 * crew sails out of Tel Aviv, and a forecast for wherever the boat row happens
 * to point is not what anyone is actually asking when they check the app.
 */
export const TEL_AVIV = {
  latitude: 32.0853,
  longitude: 34.7818,
  label: "תל אביב",
  /**
   * Pinned explicitly because this card is now rendered on the server, which
   * runs in UTC. Anything derived from a clock has to name the zone or it comes
   * out three hours wrong for the only people who will ever read it.
   */
  timeZone: "Asia/Jerusalem",
} as const;

export type Weather = {
  temperature: number;
  apparentTemperature: number;
  windSpeedKn: number;
  windGustKn: number;
  windDirection: number;
  weatherCode: number;
  visibilityKm: number | null;
  sunset: string | null;
  waveHeight: number | null;
  wavePeriod: number | null;
  waveDirection: number | null;
  seaTemperature: number | null;
  /** Today first, then the following days. Powers the card's day carousel. */
  days: DailyForecast[];
};

/** One hour of a day, in Tel Aviv local time. */
export type HourReading = {
  /** 0–23, local. The API is queried with `timezone=auto`, so the hour in the
   *  response string is already the hour a person here would read off a clock. */
  hour: number;
  windSpeedKn: number;
  windGustKn: number;
  weatherCode: number;
};

/**
 * One day of the outlook.
 *
 * Summarised **across daylight hours only**, and as a range rather than a
 * single number. Neither is fussiness. On this coast the sea breeze builds
 * around noon and dies at sunset: a July day here runs 1.4 knots at 06:00 and
 * 7.7 knots with 22-knot gusts at 14:00. A daily maximum describes those four
 * afternoon hours and mislabels the other twenty; including the night in the
 * range drags the floor down to a calm nobody is awake for.
 *
 * The hourly readings are kept so the card can draw the shape of the day
 * instead of asserting a verdict over it.
 */
export type DailyForecast = {
  /** Local calendar date in Tel Aviv, "2026-07-29". */
  date: string;
  /**
   * The condition to *print* — what this day is actually like, from
   * `dayCondition()`. Deliberately not Open-Meteo's daily `weather_code`,
   * which is the day's most severe hour and so labelled a 32° day that was
   * clear for ten hours "ערפל" on the strength of one foggy hour before dawn.
   */
  weatherCode: number;
  /**
   * The worst daylight hour, kept separately so softening the headline cannot
   * soften a warning: `dailyVerdict` still reads this for the storm override.
   * Also what lets a panel name a real spell the headline does not cover.
   */
  severeCode: number;
  tempMax: number;
  tempMin: number;
  windMinKn: number;
  windMaxKn: number;
  gustMinKn: number;
  gustMaxKn: number;
  windDirection: number;
  waveHeight: number | null;
  wavePeriod: number | null;
  /** Real instants, already resolved out of Open-Meteo's bare local time. */
  sunrise: string | null;
  sunset: string | null;
  /** Sunrise to sunset, hour by hour. */
  hours: HourReading[];
};

/**
 * The gust a day is considered calm below.
 *
 * This is the one number to move if the card is too cautious or not cautious
 * enough — it sets which hours the profile paints as calm and which stretch
 * gets named as the window. It is deliberately a plain gust reading rather
 * than a ratio: gusts on this coast run a steady 2.8–3× the mean wind at every
 * hour of the day, including at 02:00 in a dead calm, so a ratio test is true
 * around the clock and separates nothing.
 */
export const CALM_GUST_KN = 15;

export type CalmWindow = { fromHour: number; toHour: number };

/**
 * The longest unbroken stretch of daylight hours with gusts under the limit —
 * "you can go out between these times". Null when the day never settles.
 */
export function calmWindow(
  hours: HourReading[],
  limitKn: number = CALM_GUST_KN,
): CalmWindow | null {
  let best: CalmWindow | null = null;
  let start: number | null = null;

  const length = (window: CalmWindow) => window.toHour - window.fromHour;

  for (const [index, reading] of hours.entries()) {
    const calm = reading.windGustKn < limitKn;

    if (calm && start === null) start = reading.hour;

    // Close the run on the first gusty hour, or at the end of the day.
    const next = hours[index + 1];
    const ends = !calm || !next || next.hour !== reading.hour + 1;

    if (start !== null && ends) {
      const candidate = {
        fromHour: start,
        toHour: calm ? reading.hour + 1 : reading.hour,
      };
      if (length(candidate) > 0 && (!best || length(candidate) > length(best))) {
        best = candidate;
      }
      start = null;
    }
  }

  return best;
}

/** "06:00–11:00" */
export function formatWindow(window: CalmWindow): string {
  const pad = (hour: number) => `${String(hour % 24).padStart(2, "0")}:00`;
  return `${pad(window.fromHour)}–${pad(window.toHour)}`;
}

const dayNameFormatter = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  timeZone: TEL_AVIV.timeZone,
});

const dayDateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "numeric",
  timeZone: TEL_AVIV.timeZone,
});

/** Today's date in Tel Aviv as "2026-07-28" — en-CA is ISO order. */
function telAvivToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TEL_AVIV.timeZone,
  }).format(now);
}

/**
 * "היום" / "מחר" / "יום ג׳" for a forecast day. The zone is pinned for the
 * same reason everything else clock-derived here is: the server runs in UTC,
 * and a bare weekday would flip a day either side of midnight Israel time.
 */
export function dayLabel(date: string, now: Date = new Date()): string {
  const today = telAvivToday(now);
  if (date === today) return "היום";

  const tomorrow = telAvivToday(new Date(now.getTime() + 86_400_000));
  if (date === tomorrow) return "מחר";

  return dayNameFormatter.format(new Date(`${date}T12:00:00Z`));
}

/** "29.7" — the secondary line under the day name. */
export function dayDate(date: string): string {
  return dayDateFormatter.format(new Date(`${date}T12:00:00Z`));
}

/** WMO weather codes → a Hebrew label and a lucide icon name. */
export function describeWeather(code: number): { label: string; icon: string } {
  if (code === 0) return { label: "בהיר", icon: "sun" };
  if (code <= 2) return { label: "מעונן חלקית", icon: "cloud-sun" };
  if (code === 3) return { label: "מעונן", icon: "cloud" };
  if (code <= 48) return { label: "ערפל", icon: "cloud-fog" };
  if (code <= 57) return { label: "טפטוף", icon: "cloud-drizzle" };
  if (code <= 67) return { label: "גשם", icon: "cloud-rain" };
  if (code <= 77) return { label: "שלג", icon: "snowflake" };
  if (code <= 82) return { label: "ממטרים", icon: "cloud-rain" };
  if (code <= 86) return { label: "ממטרי שלג", icon: "snowflake" };
  return { label: "סופת רעמים", icon: "cloud-lightning" };
}

/**
 * How much of the daylight day a condition has to hold before it gets to be
 * the day's headline. A quarter is roughly three hours of a summer day here —
 * long enough to be what the day *was*, short enough that an afternoon of rain
 * still gets named.
 */
export const CONDITION_SHARE = 0.25;

/**
 * Group hours by the phrase the card would print for them, not by raw WMO
 * code. 1 and 2 both read "מעונן חלקית", and three hours of each is a
 * half-cloudy day even though neither code alone clears the bar.
 */
function byCondition(hours: HourReading[]): number[][] {
  const buckets = new Map<string, number[]>();
  for (const { weatherCode } of hours) {
    const key = describeWeather(weatherCode).label;
    const codes = buckets.get(key);
    if (codes) codes.push(weatherCode);
    else buckets.set(key, [weatherCode]);
  }
  return [...buckets.values()];
}

/**
 * The condition to put at the top of a day panel.
 *
 * The severest condition that holds for a real part of the daylight day —
 * falling back to the most common one if the day is too mixed for anything to
 * qualify. This is the same rule the wind already follows: **never summarise a
 * sailing day by its single most extreme hour.** Open-Meteo's daily
 * `weather_code` is exactly that maximum, which is how a clear 32° August day
 * came to be labelled "ערפל" off one hour of coastal fog at dawn — and why the
 * hours are restricted to daylight here, since that fog had usually burned off
 * before anyone was awake to see it.
 *
 * Severity is taken as raw code order, which WMO gives us for free and which
 * holds everywhere it matters on this coast.
 */
export function dayCondition(hours: HourReading[]): number {
  if (hours.length === 0) return 0;

  const buckets = byCondition(hours);
  const holds = buckets.filter(
    (codes) => codes.length / hours.length >= CONDITION_SHARE,
  );
  if (holds.length) return Math.max(...holds.flat());

  const commonest = buckets.reduce((a, b) => (b.length > a.length ? b : a));
  return Math.max(...commonest);
}

/** The worst hour of the day — what a warning is allowed to be drawn from. */
export function severeCondition(hours: HourReading[]): number {
  return hours.length ? Math.max(...hours.map((hour) => hour.weatherCode)) : 0;
}

/**
 * When the headline does not cover something, say when that something is:
 * "בהיר · ערפל 07:00–09:00" beats either dropping the fog or letting it
 * rename the day.
 *
 * First matching hour to last — an outer bound, not an unbroken run like
 * `calmWindow`. Fog that lifts and returns reads as one long spell, which
 * errs toward warning and is the right way round for weather you are being
 * told about rather than invited into.
 *
 * Null when the code never appears, or when it holds the whole day and the
 * headline has therefore already said so.
 */
export function conditionSpell(
  hours: HourReading[],
  code: number,
): CalmWindow | null {
  const label = describeWeather(code).label;
  const matching = hours.filter(
    (hour) => describeWeather(hour.weatherCode).label === label,
  );
  if (matching.length === 0 || matching.length === hours.length) return null;

  return {
    fromHour: matching[0].hour,
    toHour: matching[matching.length - 1].hour + 1,
  };
}

const COMPASS = [
  "צפון",
  "צפון-מזרח",
  "מזרח",
  "דרום-מזרח",
  "דרום",
  "דרום-מערב",
  "מערב",
  "צפון-מערב",
] as const;

const COMPASS_SHORT = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export function windDirectionLabel(degrees: number): string {
  return COMPASS[Math.round(degrees / 45) % 8];
}

export function windDirectionShort(degrees: number): string {
  return COMPASS_SHORT[Math.round(degrees / 45) % 8];
}

/**
 * Douglas-ish sea state from wave height, phrased the way sailors here talk
 * about it. Falls back to wind when there is no marine data.
 */
export function seaStateLabel(
  waveHeight: number | null,
  windSpeedKn: number,
): string {
  if (waveHeight === null) {
    if (windSpeedKn < 7) return "ים רגוע";
    if (windSpeedKn < 17) return "ים קל";
    if (windSpeedKn < 27) return "ים גבוה";
    return "ים סוער";
  }
  if (waveHeight < 0.2) return "ים שקט";
  if (waveHeight < 0.5) return "ים רגוע";
  if (waveHeight < 1.25) return "ים קל";
  if (waveHeight < 2.5) return "ים בינוני";
  return "ים סוער";
}

/** Is it pleasant enough to take the boat out? Drives the accent colour. */
export function isGoodSailing(windSpeedKn: number, waveHeight: number | null) {
  const calmEnough = waveHeight === null ? windSpeedKn < 20 : waveHeight < 1.25;
  return windSpeedKn >= 5 && calmEnough;
}

/**
 * Gusts matter more than average wind for a day out. A gust half again the
 * steady wind is a squally, shifty day even when the average reads mild — the
 * average is what lulls you into going, the gust is what you actually sail in.
 */
export function gustFactor(windSpeedKn: number, windGustKn: number): number {
  if (windSpeedKn <= 0) return windGustKn > 0 ? Infinity : 1;
  return windGustKn / windSpeedKn;
}

export function isGusty(windSpeedKn: number, windGustKn: number): boolean {
  return windGustKn >= 15 && gustFactor(windSpeedKn, windGustKn) >= 1.6;
}

/**
 * Short, choppy waves are far more uncomfortable than their height suggests —
 * a metre at 4 seconds slams, a metre at 9 seconds rolls. Only meaningful once
 * there is a wave to speak of.
 */
export function isChoppy(
  waveHeight: number | null,
  wavePeriod: number | null,
): boolean {
  if (waveHeight === null || wavePeriod === null) return false;
  return waveHeight >= 0.5 && wavePeriod < 5;
}

/** Whole hours of daylight left, or null once the sun is down. */
export function hoursUntilSunset(
  sunsetISO: string | null,
  now: Date = new Date(),
): number | null {
  if (!sunsetISO) return null;
  const sunset = new Date(sunsetISO);
  if (Number.isNaN(sunset.getTime())) return null;

  const hours = (sunset.getTime() - now.getTime()) / 3_600_000;
  return hours <= 0 ? null : Math.floor(hours);
}

export type Verdict = {
  label: string;
  tone: "good" | "caution" | "poor";
};

/**
 * The readings a verdict is drawn from — nothing more, so a caller holding
 * only an instant's worth of data can still ask.
 */
export type VerdictInput = Pick<
  Weather,
  "windSpeedKn" | "windGustKn" | "waveHeight" | "wavePeriod" | "weatherCode"
>;

/**
 * One line answering the only question the card exists to answer: can we go
 * out? Gust and chop are called out by name, because those are the two that a
 * glance at temperature and wave height alone will miss.
 *
 * This judges a **moment** — it is what the live reading on today's panel uses.
 * A whole day is judged by `dailyVerdict`, which asks a different question.
 */
export function sailingVerdict(weather: VerdictInput): Verdict {
  const { windSpeedKn, windGustKn, waveHeight, wavePeriod, weatherCode } = weather;

  if (weatherCode >= 95) return { label: "סופת רעמים — לא יוצאים", tone: "poor" };
  if (windGustKn >= 30 || (waveHeight !== null && waveHeight >= 2))
    return { label: "ים סוער — לא מומלץ", tone: "poor" };

  if (isGusty(windSpeedKn, windGustKn))
    return { label: "משבים חזקים — להיזהר", tone: "caution" };
  if (isChoppy(waveHeight, wavePeriod))
    return { label: "ים קצוץ — לא נוח", tone: "caution" };
  if (windSpeedKn >= 22)
    return { label: "רוח חזקה — למנוסים", tone: "caution" };

  if (windSpeedKn < 5) return { label: "כמעט בלי רוח", tone: "caution" };

  return { label: "תנאים טובים להפלגה", tone: "good" };
}

/**
 * A whole day, judged by the question you actually ask of a forecast: *is
 * there a stretch of this day I could go out in?*
 *
 * Not by the day's worst hour, which on a sea-breeze coast is always the
 * afternoon and would condemn every day alike. A morning of glass followed by
 * a blowy afternoon is a good day with a window in it, and that is what this
 * says. Only conditions that rule out the whole day — storms, a heavy sea —
 * override the window.
 */
export function dailyVerdict(day: DailyForecast): Verdict {
  // `severeCode`, not the headline: the headline is deliberately the condition
  // that held for most of the day, and an afternoon thunderstorm has to stop
  // you going out even when the morning was the day's real character.
  if (day.severeCode >= 95)
    return { label: "סופת רעמים — לא יוצאים", tone: "poor" };
  if (day.gustMaxKn >= 30 || (day.waveHeight !== null && day.waveHeight >= 2))
    return { label: "ים סוער — לא מומלץ", tone: "poor" };
  if (isChoppy(day.waveHeight, day.wavePeriod))
    return { label: "ים קצוץ — לא נוח", tone: "caution" };

  const window = calmWindow(day.hours);
  if (!window) return { label: "משבים לאורך כל היום", tone: "caution" };

  const hours = window.toHour - window.fromHour;
  if (hours < 3) return { label: "חלון קצר בלבד", tone: "caution" };

  return { label: "יש חלון טוב להפלגה", tone: "good" };
}
