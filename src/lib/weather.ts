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
};

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
 * One line answering the only question the card exists to answer: can we go
 * out? Gust and chop are called out by name, because those are the two that a
 * glance at temperature and wave height alone will miss.
 */
export function sailingVerdict(weather: Weather): Verdict {
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
