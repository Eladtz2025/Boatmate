"use client";

import { useEffect, useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Snowflake,
  Sun,
  Waves,
  Wind,
} from "lucide-react";
import { TileLabel } from "@/components/ui/card";
import {
  describeWeather,
  isGoodSailing,
  seaStateLabel,
  windDirectionShort,
  type Weather,
} from "@/lib/weather";
import { cn } from "@/lib/cn";

const ICONS = {
  sun: Sun,
  "cloud-sun": CloudSun,
  cloud: Cloud,
  "cloud-fog": CloudFog,
  "cloud-drizzle": CloudDrizzle,
  "cloud-rain": CloudRain,
  snowflake: Snowflake,
  "cloud-lightning": CloudLightning,
} as const;

export function WeatherCard({
  latitude,
  longitude,
}: {
  latitude: number | null;
  longitude: number | null;
}) {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (latitude !== null) params.set("lat", String(latitude));
    if (longitude !== null) params.set("lon", String(longitude));

    let cancelled = false;
    fetch(`/api/weather?${params}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: Weather) => {
        if (!cancelled) setWeather(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [latitude, longitude]);

  if (failed) {
    return (
      <div className="card flex flex-col gap-2 p-4">
        <TileLabel>מזג אוויר ימי</TileLabel>
        <p className="text-xs text-ink-subtle">לא זמין כרגע</p>
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="card flex animate-pulse flex-col gap-3 p-4">
        <TileLabel>מזג אוויר ימי</TileLabel>
        <div className="h-8 w-16 rounded-lg bg-hull-750" />
        <div className="h-3 w-24 rounded bg-hull-750" />
      </div>
    );
  }

  const { label, icon } = describeWeather(weather.weatherCode);
  const Icon = ICONS[icon as keyof typeof ICONS] ?? Sun;
  const good = isGoodSailing(weather.windSpeedKn, weather.waveHeight);

  return (
    <div className="card flex flex-col gap-2 p-4">
      <TileLabel>מזג אוויר ימי</TileLabel>

      <div className="flex items-center justify-between gap-2">
        <span className="numeric text-3xl font-bold leading-none">
          {weather.temperature}°
        </span>
        <Icon className="size-7 text-warning" aria-hidden />
      </div>

      <p className="text-xs text-ink-muted">{label}</p>

      <div className="mt-1 flex items-center gap-3 border-t border-[var(--hairline)] pt-2 text-xs">
        <span className="flex items-center gap-1 text-ink-muted">
          <Wind className="size-3.5" aria-hidden />
          <span className="numeric">{weather.windSpeedKn}</span> קשר
        </span>
        <span className="numeric text-ink-subtle">
          {windDirectionShort(weather.windDirection)}
        </span>
      </div>

      <p
        className={cn(
          "flex items-center gap-1 text-xs font-medium",
          good ? "text-teal-400" : "text-ink-muted",
        )}
      >
        <Waves className="size-3.5" aria-hidden />
        {seaStateLabel(weather.waveHeight, weather.windSpeedKn)}
      </p>
    </div>
  );
}
