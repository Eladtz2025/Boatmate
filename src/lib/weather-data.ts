import "server-only";
import {
  DAY_PERIODS,
  TEL_AVIV,
  dayCondition,
  severeCondition,
  summarisePeriod,
  type DailyForecast,
  type HourReading,
  type PeriodForecast,
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

/**
 * Neither call is allowed to hold the home screen open. Without this a hung
 * connection blocks the render until the platform's own limit, and the one
 * screen the app opens to sits on a skeleton.
 */
const TIMEOUT_MS = 8000;

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

/** Everything the two APIs give us per hour, indexed the way they return it. */
type HourlySeries = {
  time: string[];
  wind: number[];
  gust: number[];
  code: number[];
  temperature: number[];
  direction: number[];
  /** Marine is a separate service and is allowed to be missing entirely. */
  wave: Map<string, { height: number | null; period: number | null }>;
};

/**
 * The hours of one date inside `[fromHour, toHour)`.
 *
 * One extraction for both jobs the card has: the daylight profile, and the
 * three fixed clock windows. The windows deliberately do **not** clip to
 * daylight — 16:00–20:00 is a real question in January even though the sun is
 * down for half of it, and clipping would have silently emptied that window
 * every winter.
 */
function hoursInRange(
  series: HourlySeries,
  date: string,
  fromHour: number,
  toHour: number,
): HourReading[] {
  const hours: HourReading[] = [];

  for (const [index, timestamp] of series.time.entries()) {
    if (!timestamp.startsWith(date)) continue;
    const hour = localHour(timestamp);
    if (hour < fromHour || hour >= toHour) continue;

    const sea = series.wave.get(timestamp);

    hours.push({
      hour,
      windSpeedKn: round(series.wind[index]),
      windGustKn: round(series.gust[index]),
      weatherCode: round(series.code[index]),
      temperatureC: numberOrNull(series.temperature[index]),
      windDirection: numberOrNull(series.direction[index]),
      waveHeight: sea?.height ?? null,
      wavePeriod: sea?.period ?? null,
    });
  }

  return hours;
}

/** Fetch that gives up rather than holding the page. */
const get = (url: string) =>
  fetch(url, {
    next: { revalidate: REVALIDATE },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

export async function getConditions(): Promise<Weather | null> {
  const { latitude, longitude } = TEL_AVIV;

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,visibility` +
    `&daily=sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min,wind_direction_10m_dominant` +
    `&hourly=wind_speed_10m,wind_gusts_10m,weather_code,temperature_2m,wind_direction_10m` +
    `&wind_speed_unit=kn&timezone=auto&forecast_days=${FORECAST_DAYS}`;

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${latitude}&longitude=${longitude}` +
    `&current=wave_height,wave_period,wave_direction,sea_surface_temperature` +
    `&daily=wave_height_max,wave_period_max` +
    `&hourly=wave_height,wave_period` +
    `&timezone=auto&forecast_days=${FORECAST_DAYS}`;

  try {
    const [forecastResponse, marineResponse] = await Promise.all([
      get(forecastUrl),
      // Sea state is a bonus; losing it must not cost us the whole card.
      get(marineUrl).catch(() => null),
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

    // Marine hours are keyed by their own timestamp for the same reason: the
    // two series are the same length in practice and must not be assumed to be.
    const marineHourly = marine?.hourly ?? {};
    const waveByHour = new Map<string, { height: number | null; period: number | null }>(
      ((marineHourly.time ?? []) as string[]).map((timestamp, index) => [
        timestamp,
        {
          height: numberOrNull(marineHourly.wave_height?.[index]),
          period: numberOrNull(marineHourly.wave_period?.[index]),
        },
      ]),
    );

    const hourly = forecast.hourly ?? {};
    const hourlyCodes = (hourly.weather_code ?? []) as number[];

    const series: HourlySeries = {
      time: (hourly.time ?? []) as string[],
      wind: (hourly.wind_speed_10m ?? []) as number[],
      gust: (hourly.wind_gusts_10m ?? []) as number[],
      code: hourlyCodes,
      temperature: (hourly.temperature_2m ?? []) as number[],
      direction: (hourly.wind_direction_10m ?? []) as number[],
      wave: waveByHour,
    };

    const days: DailyForecast[] = ((daily.time ?? []) as string[]).map(
      (date, index) => {
        const seaDay = seaByDate.get(date);

        // Without a sun time, fall back to a generous daylight span rather than
        // dropping the whole profile.
        const sunriseLocal: string | undefined = daily.sunrise?.[index];
        const sunsetLocal: string | undefined = daily.sunset?.[index];
        const fromHour = sunriseLocal ? firstDaylightHour(sunriseLocal) : 6;
        const toHour = sunsetLocal ? localHour(sunsetLocal) + 1 : 21;

        const hours = hoursInRange(series, date, fromHour, toHour);

        const periods: PeriodForecast[] = DAY_PERIODS.map((period) =>
          summarisePeriod(
            period.key,
            hoursInRange(series, date, period.fromHour, period.toHour),
          ),
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
          sunrise: resolveInstant(sunriseLocal, offsetSeconds),
          sunset: resolveInstant(sunsetLocal, offsetSeconds),
          hours,
          periods,
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
