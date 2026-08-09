import "server-only";
import {
  TEL_AVIV,
  dayCondition,
  severeCondition,
  type DailyForecast,
  type HourReading,
  type Weather,
} from "./weather";

/**
 * Marine conditions, fetched on the server.
 *
 * This used to live behind /api/weather and be called from the browser on
 * mount, which meant the card painted a skeleton on every single home visit
 * even though the data was already cached — a visible stall on the one screen
 * the app opens to. Fetching here lets the cached response render straight into
 * the HTML, and Suspense covers the cold path.
 *
 * Open-Meteo is free and needs no API key. The marine grid is coarse and snaps
 * a coastal point to the nearest sea cell on its own, so Tel Aviv's centre
 * resolves to open water offshore without hand-picking a point.
 */

const REVALIDATE = 900; // 15 minutes

/** Today plus the next four — what the card's carousel pages through. */
const FORECAST_DAYS = 5;

/**
 * Open-Meteo returns times as bare local strings ("2026-07-28T19:41") with the
 * zone reported separately in `utc_offset_seconds`. Parsed on a UTC server that
 * reads as 19:41 UTC, which silently shifts anything clock-derived by the
 * offset. Resolve it to a real instant here so nothing downstream has to know.
 */
function resolveInstant(local: string | null | undefined, offsetSeconds: number) {
  if (!local) return null;
  return new Date(Date.parse(`${local}:00Z`) - offsetSeconds * 1000).toISOString();
}

const round = (value: unknown): number =>
  typeof value === "number" ? Math.round(value) : 0;

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" ? value : null;

/**
 * The hour out of a bare local timestamp, "2026-07-29T14:00" → 14.
 *
 * Read straight off the string rather than through `Date`. The request carries
 * `timezone=auto`, so these are already Tel Aviv wall-clock times — parsing
 * them on a UTC server would shift every one of them by the offset, which is
 * the exact trap the sunset handling above exists to avoid.
 */
function localHour(timestamp: string): number {
  return Number(timestamp.slice(11, 13));
}

/**
 * Sun times rounded *inward* to whole hours: sunrise 05:56 makes 06:00 the
 * first usable hour, sunset 19:41 makes 19:00 the last. Rounding the other way
 * offered a 05:00 start on a day the sun was not up yet.
 */
function firstDaylightHour(sunriseLocal: string): number {
  const minutes = Number(sunriseLocal.slice(14, 16));
  return minutes > 0 ? localHour(sunriseLocal) + 1 : localHour(sunriseLocal);
}

/**
 * Everything between sunrise and sunset — nobody is planning a 03:00 sail.
 *
 * This window is also what keeps the day's headline honest. Tel Aviv's summer
 * fog forms before dawn and is gone by the time anyone looks at the app; kept
 * in, it counts toward the day's condition and can end up naming it.
 */
function daylightHours(
  times: string[],
  wind: number[],
  gusts: number[],
  codes: number[],
  date: string,
  sunriseLocal: string | undefined,
  sunsetLocal: string | undefined,
): HourReading[] {
  // Without a sun time, fall back to a generous daylight span rather than
  // dropping the whole profile.
  const from = sunriseLocal ? firstDaylightHour(sunriseLocal) : 6;
  const to = sunsetLocal ? localHour(sunsetLocal) : 20;

  const hours: HourReading[] = [];
  for (const [index, timestamp] of times.entries()) {
    if (!timestamp.startsWith(date)) continue;
    const hour = localHour(timestamp);
    if (hour < from || hour > to) continue;
    hours.push({
      hour,
      windSpeedKn: round(wind[index]),
      windGustKn: round(gusts[index]),
      weatherCode: round(codes[index]),
    });
  }
  return hours;
}

export async function getConditions(): Promise<Weather | null> {
  const { latitude, longitude } = TEL_AVIV;

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,visibility` +
    `&daily=sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min,wind_direction_10m_dominant` +
    `&hourly=wind_speed_10m,wind_gusts_10m,weather_code` +
    `&wind_speed_unit=kn&timezone=auto&forecast_days=${FORECAST_DAYS}`;

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${latitude}&longitude=${longitude}` +
    `&current=wave_height,wave_period,wave_direction,sea_surface_temperature` +
    `&daily=wave_height_max,wave_period_max` +
    `&timezone=auto&forecast_days=${FORECAST_DAYS}`;

  try {
    const [forecastResponse, marineResponse] = await Promise.all([
      fetch(forecastUrl, { next: { revalidate: REVALIDATE } }),
      // Sea state is a bonus; losing it must not cost us the whole card.
      fetch(marineUrl, { next: { revalidate: REVALIDATE } }).catch(() => null),
    ]);

    if (!forecastResponse.ok) return null;

    const forecast = await forecastResponse.json();
    const marine =
      marineResponse && marineResponse.ok ? await marineResponse.json() : null;

    const current = forecast.current ?? {};
    const sea = marine?.current ?? null;

    // Metres to kilometres — nobody needs visibility to the nearest 10 metres.
    const visibilityM = current.visibility;

    const offsetSeconds: number = forecast.utc_offset_seconds ?? 0;
    const daily = forecast.daily ?? {};
    const sunset = resolveInstant(daily.sunset?.[0], offsetSeconds);

    // The two APIs are asked for the same days, but they are separate services
    // and the marine one is allowed to fail on its own. Index it by date rather
    // than by position so a short or missing array degrades to "no wave data"
    // instead of pairing Tuesday's swell with Wednesday's wind.
    const marineDaily = marine?.daily ?? {};
    const seaByDate = new Map<string, { height: number | null; period: number | null }>(
      ((marineDaily.time ?? []) as string[]).map((date, index) => [
        date,
        {
          height: numberOrNull(marineDaily.wave_height_max?.[index]),
          period: numberOrNull(marineDaily.wave_period_max?.[index]),
        },
      ]),
    );

    const hourly = forecast.hourly ?? {};
    const hourlyCodes = (hourly.weather_code ?? []) as number[];

    const days: DailyForecast[] = ((daily.time ?? []) as string[]).map(
      (date, index) => {
        const seaDay = seaByDate.get(date);
        const hours = daylightHours(
          hourly.time ?? [],
          hourly.wind_speed_10m ?? [],
          hourly.wind_gusts_10m ?? [],
          hourlyCodes,
          date,
          daily.sunrise?.[index],
          daily.sunset?.[index],
        );

        // Ranges over the daylight hours we actually kept, so the floor is the
        // calmest sailable hour rather than 03:00.
        const winds = hours.map((hour) => hour.windSpeedKn);
        const gusts = hours.map((hour) => hour.windGustKn);

        // With no hourly codes there is nothing to read the day's character
        // from, and `round()` would turn the gap into a confident "בהיר" for
        // every day. Fall back to the daily code — worse, but not invented.
        const dailyCode: number = daily.weather_code?.[index] ?? 0;
        const readable = hours.length > 0 && hourlyCodes.length > 0;

        return {
          date,
          weatherCode: readable ? dayCondition(hours) : dailyCode,
          severeCode: readable ? severeCondition(hours) : dailyCode,
          tempMax: round(daily.temperature_2m_max?.[index]),
          tempMin: round(daily.temperature_2m_min?.[index]),
          windMinKn: winds.length ? Math.min(...winds) : 0,
          windMaxKn: winds.length ? Math.max(...winds) : 0,
          gustMinKn: gusts.length ? Math.min(...gusts) : 0,
          gustMaxKn: gusts.length ? Math.max(...gusts) : 0,
          windDirection: daily.wind_direction_10m_dominant?.[index] ?? 0,
          waveHeight: seaDay?.height ?? null,
          wavePeriod: seaDay?.period ?? null,
          sunrise: resolveInstant(daily.sunrise?.[index], offsetSeconds),
          sunset: resolveInstant(daily.sunset?.[index], offsetSeconds),
          hours,
        };
      },
    );

    return {
      temperature: Math.round(current.temperature_2m ?? 0),
      apparentTemperature: Math.round(
        current.apparent_temperature ?? current.temperature_2m ?? 0,
      ),
      windSpeedKn: Math.round(current.wind_speed_10m ?? 0),
      windGustKn: Math.round(current.wind_gusts_10m ?? 0),
      windDirection: current.wind_direction_10m ?? 0,
      weatherCode: current.weather_code ?? 0,
      visibilityKm:
        typeof visibilityM === "number" ? Math.round(visibilityM / 1000) : null,
      sunset,
      waveHeight: sea?.wave_height ?? null,
      wavePeriod: sea?.wave_period ?? null,
      waveDirection: sea?.wave_direction ?? null,
      seaTemperature:
        typeof sea?.sea_surface_temperature === "number"
          ? Math.round(sea.sea_surface_temperature)
          : null,
      days,
    };
  } catch {
    return null;
  }
}
