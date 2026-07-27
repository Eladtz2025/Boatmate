import { NextResponse, type NextRequest } from "next/server";

/**
 * Marine weather for the home screen.
 *
 * Open-Meteo is free and needs no API key. We proxy it server-side so the
 * response can be cached and the boat's coordinates never have to round-trip
 * through the client.
 *
 * Defaults to Herzliya Marina when the boat has no coordinates set.
 */

const DEFAULT_LAT = 32.1624;
const DEFAULT_LON = 34.7961;

export const revalidate = 900; // 15 minutes

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = Number(searchParams.get("lat") ?? DEFAULT_LAT);
  const lon = Number(searchParams.get("lon") ?? DEFAULT_LON);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "bad coordinates" }, { status: 400 });
  }

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code` +
    `&wind_speed_unit=kn&timezone=auto`;

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&current=wave_height&timezone=auto`;

  try {
    const [forecastResponse, marineResponse] = await Promise.all([
      fetch(forecastUrl, { next: { revalidate } }),
      // The marine grid does not cover every inland point; a failure here is
      // not fatal, we simply omit the sea state.
      fetch(marineUrl, { next: { revalidate } }).catch(() => null),
    ]);

    if (!forecastResponse.ok) {
      return NextResponse.json({ error: "forecast unavailable" }, { status: 502 });
    }

    const forecast = await forecastResponse.json();
    const marine =
      marineResponse && marineResponse.ok ? await marineResponse.json() : null;

    return NextResponse.json({
      temperature: Math.round(forecast.current?.temperature_2m ?? 0),
      windSpeedKn: Math.round(forecast.current?.wind_speed_10m ?? 0),
      windDirection: forecast.current?.wind_direction_10m ?? 0,
      weatherCode: forecast.current?.weather_code ?? 0,
      waveHeight: marine?.current?.wave_height ?? null,
    });
  } catch {
    return NextResponse.json({ error: "weather unavailable" }, { status: 502 });
  }
}
