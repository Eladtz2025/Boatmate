/** Presentation helpers for the marine weather card. */

export type Weather = {
  temperature: number;
  windSpeedKn: number;
  windDirection: number;
  weatherCode: number;
  waveHeight: number | null;
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
