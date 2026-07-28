"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Eye,
  Snowflake,
  Sun,
  Sunset,
  Thermometer,
  TriangleAlert,
  Waves,
  Wind,
  Zap,
} from "lucide-react";
import { TileLabel } from "@/components/ui/card";
import {
  TEL_AVIV,
  describeWeather,
  hoursUntilSunset,
  isGusty,
  sailingVerdict,
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

const VERDICT_TONE = {
  good: "text-teal-400",
  caution: "text-warning",
  poor: "text-danger",
} as const;

/** One of the four readings. Value and unit are separated so only the number
 *  carries the large weight — a wall of equally bold text reads as noise. */
function Reading({
  icon,
  label,
  value,
  unit,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  detail?: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-hull-750 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-ink-muted">
        {icon}
        <span className="truncate text-[11px] font-medium">{label}</span>
      </div>
      <p className={cn("flex items-baseline gap-1", tone)}>
        <span className="numeric text-xl font-bold leading-none">{value}</span>
        {unit && <span className="text-[11px] text-ink-muted">{unit}</span>}
      </p>
      {detail && (
        <p className="mt-0.5 truncate text-[11px] text-ink-subtle">{detail}</p>
      )}
    </div>
  );
}

/**
 * The sailing card: weather, waves, wind and gust for Tel Aviv in one place,
 * with the judgement call spelled out underneath rather than left to the
 * reader. Replaces both the old weather tile and the "next event" tile.
 */
export function SailingConditions() {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/weather")
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
  }, []);

  if (failed) {
    return (
      <div className="card flex flex-col gap-2 p-4">
        <TileLabel>תנאי הפלגה · {TEL_AVIV.label}</TileLabel>
        <p className="text-xs text-ink-subtle">לא זמין כרגע</p>
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="card flex animate-pulse flex-col gap-3 p-4">
        <TileLabel>תנאי הפלגה · {TEL_AVIV.label}</TileLabel>
        <div className="h-8 w-20 rounded-lg bg-hull-750" />
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((tile) => (
            <div key={tile} className="h-20 rounded-2xl bg-hull-750" />
          ))}
        </div>
      </div>
    );
  }

  const { label, icon } = describeWeather(weather.weatherCode);
  const Icon = ICONS[icon as keyof typeof ICONS] ?? Sun;
  const verdict = sailingVerdict(weather);
  const gusty = isGusty(weather.windSpeedKn, weather.windGustKn);
  const daylightLeft = hoursUntilSunset(weather.sunset);

  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <TileLabel>תנאי הפלגה · {TEL_AVIV.label}</TileLabel>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="numeric text-3xl font-bold leading-none">
              {weather.temperature}°
            </span>
            <span className="truncate text-sm text-ink-muted">{label}</span>
          </p>
          {weather.apparentTemperature !== weather.temperature && (
            <p className="mt-0.5 text-[11px] text-ink-subtle">
              מרגיש כמו <span className="numeric">{weather.apparentTemperature}°</span>
            </p>
          )}
        </div>
        <Icon className="size-8 shrink-0 text-warning" aria-hidden />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Reading
          icon={<Waves className="size-3.5" aria-hidden />}
          label="גובה גלים"
          value={weather.waveHeight === null ? "—" : weather.waveHeight.toFixed(1)}
          unit={weather.waveHeight === null ? undefined : "מ׳"}
          detail={
            weather.wavePeriod === null
              ? seaStateLabel(weather.waveHeight, weather.windSpeedKn)
              : `מחזור ${weather.wavePeriod.toFixed(0)} שנ׳`
          }
        />

        <Reading
          icon={<Wind className="size-3.5" aria-hidden />}
          label="רוח"
          value={String(weather.windSpeedKn)}
          unit="קשר"
          detail={`מכיוון ${windDirectionShort(weather.windDirection)}`}
        />

        <Reading
          icon={<Zap className="size-3.5" aria-hidden />}
          label="משבים"
          value={String(weather.windGustKn)}
          unit="קשר"
          detail={gusty ? "פי 1.6 מהרוח" : undefined}
          tone={gusty ? "text-warning" : undefined}
        />

        <Reading
          icon={<Thermometer className="size-3.5" aria-hidden />}
          label="טמפ׳ מים"
          value={weather.seaTemperature === null ? "—" : `${weather.seaTemperature}°`}
          detail={seaStateLabel(weather.waveHeight, weather.windSpeedKn)}
        />
      </div>

      <div className="flex flex-col gap-1.5 border-t border-[var(--hairline)] pt-2.5">
        <p
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium",
            VERDICT_TONE[verdict.tone],
          )}
        >
          {verdict.tone === "good" ? (
            <Waves className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          )}
          {verdict.label}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-subtle">
          {weather.sunset && (
            <span className="flex items-center gap-1">
              <Sunset className="size-3 shrink-0" aria-hidden />
              שקיעה{" "}
              <span className="numeric">
                {new Date(weather.sunset).toLocaleTimeString("he-IL", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {daylightLeft !== null && (
                <>
                  {" · עוד "}
                  <span className="numeric">{daylightLeft}</span> ש׳ אור
                </>
              )}
            </span>
          )}

          {weather.visibilityKm !== null && (
            <span className="flex items-center gap-1">
              <Eye className="size-3 shrink-0" aria-hidden />
              ראות <span className="numeric">{weather.visibilityKm}</span> ק״מ
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
