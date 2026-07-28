import { NextResponse, type NextRequest } from "next/server";
import { TEL_AVIV } from "@/lib/weather";

/**
 * Marine conditions for the home screen.
 *
 * Open-Meteo is free and needs no API key. We proxy it server-side so the
 * response can be cached and the coordinates never have to round-trip through
 * the client.
 *
 * Defaults to Tel Aviv. The marine grid is coarse and snaps a coastal point to
 * the nearest sea cell on its own, so the city centre resolves to open water
 * just off the coast — no need to hand-pick an offshore point.
 */

export const revalidate = 900; // 15 minutes

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = Number(searchParams.get("lat") ?? TEL_AVIV.latitude);
  const lon = Number(searchParams.get("lon") ?? TEL_AVIV.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "bad coordinates" }, { status: 400 });
  }

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,visibility` +
    `&daily=sunset&wind_speed_unit=kn&timezone=auto&forecast_days=1`;

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&current=wave_height,wave_period,wave_direction,sea_surface_temperature&timezone=auto`;

  try {
    const [forecastResponse, marineResponse] = await Promise.all([
      fetch(forecastUrl, { next: { revalidate } }),
      // The marine grid does not cover every point; a failure here is not
      // fatal, we simply omit the sea state.
      fetch(marineUrl, { next: { revalidate } }).catch(() => null),
    ]);

    if (!forecastResponse.ok) {
      return NextResponse.json({ error: "forecast unavailable" }, { status: 502 });
    }

    const forecast = await forecastResponse.json();
    const marine =
      marineResponse && marineResponse.ok ? await marineResponse.json() : null;

    const current = forecast.current ?? {};
    const sea = marine?.current ?? null;

    // Metres to kilometres, rounded — nobody needs visibility to 10 metres.
    const visibilityM = current.visibility;
    const visibilityKm =
      typeof visibilityM === "number" ? Math.round(visibilityM / 1000) : null;

    return NextResponse.json({
      temperature: Math.round(current.temperature_2m ?? 0),
      apparentTemperature: Math.round(
        current.apparent_temperature ?? current.temperature_2m ?? 0,
      ),
      windSpeedKn: Math.round(current.wind_speed_10m ?? 0),
      windGustKn: Math.round(current.wind_gusts_10m ?? 0),
      windDirection: current.wind_direction_10m ?? 0,
      weatherCode: current.weather_code ?? 0,
      visibilityKm,
      sunset: forecast.daily?.sunset?.[0] ?? null,
      waveHeight: sea?.wave_height ?? null,
      wavePeriod: sea?.wave_period ?? null,
      waveDirection: sea?.wave_direction ?? null,
      seaTemperature:
        typeof sea?.sea_surface_temperature === "number"
          ? Math.round(sea.sea_surface_temperature)
          : null,
    });
  } catch {
    return NextResponse.json({ error: "weather unavailable" }, { status: 502 });
  }
}
