import "server-only";
import { TEL_AVIV, type Weather } from "./weather";

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

export async function getConditions(): Promise<Weather | null> {
  const { latitude, longitude } = TEL_AVIV;

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,visibility` +
    `&daily=sunset&wind_speed_unit=kn&timezone=auto&forecast_days=1`;

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${latitude}&longitude=${longitude}` +
    `&current=wave_height,wave_period,wave_direction,sea_surface_temperature&timezone=auto`;

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

    // Open-Meteo returns sunset as bare local time ("2026-07-28T19:41") with the
    // zone reported separately. Parsed on a UTC server that reads as 19:41 UTC,
    // which silently shifts "hours of daylight left" by the offset. Resolve it
    // to a real instant here so nothing downstream has to know.
    const offsetSeconds: number = forecast.utc_offset_seconds ?? 0;
    const sunsetLocal: string | null = forecast.daily?.sunset?.[0] ?? null;
    const sunset = sunsetLocal
      ? new Date(
          Date.parse(`${sunsetLocal}:00Z`) - offsetSeconds * 1000,
        ).toISOString()
      : null;

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
    };
  } catch {
    return null;
  }
}
