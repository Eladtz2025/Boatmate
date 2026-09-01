"use client";

import { useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Snowflake,
  Sun,
  TriangleAlert,
  Waves,
  Wind,
  Zap,
} from "lucide-react";
import { TileLabel } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/**
 * The compact sailing card.
 *
 * Presentation only. Every number, label and verdict on this screen is
 * computed on the server and handed in as strings — the card keeps the
 * property that made it a Server Component in the first place: it paints from
 * a warm cache with no client fetch, and nothing gets a second chance to read
 * the clock in the wrong timezone. All this component does is choose which of
 * the pre-rendered day × window combinations to show.
 *
 * It is about half the height of the card it replaces, and the height came out
 * of aggregation rather than out of information: a day used to be one set of
 * numbers stacked over an hourly bar chart, and it is now three windows you
 * switch between, each read from its own hours.
 */

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

const TONE_TEXT = {
  good: "text-teal-400",
  caution: "text-warning",
  poor: "text-danger",
} as const;

const TONE_DOT = {
  good: "bg-teal-400",
  caution: "bg-warning",
  poor: "bg-danger",
} as const;

export type Tone = keyof typeof TONE_TEXT;

export type PeriodView = {
  key: string;
  /** "בוקר" */
  label: string;
  /** "08:00–12:00" */
  clock: string;
  /** False when the provider had no hours for this window. */
  available: boolean;
  temp: string;
  condition: string;
  icon: string;
  wind: string;
  windDetail: string;
  gust: string;
  gustWarn: boolean;
  wave: string;
  waveDetail: string;
  verdict: { label: string; tone: Tone };
};

export type DayView = {
  date: string;
  /** "היום" / "מחר" / "יום ג׳" */
  label: string;
  /** "2.9" */
  sub: string;
  tone: Tone;
  periods: PeriodView[];
  /** The window to open on — the one the clock is in, for today. */
  initialPeriod: number;
};

/** One of the four readings. Small on purpose; the card is half its old size. */
function Reading({
  icon,
  label,
  value,
  unit,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  detail?: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-hull-750 px-2 py-1.5">
      <div className="flex items-center gap-1 text-ink-muted">
        {icon}
        <span className="truncate text-[10px] leading-none">{label}</span>
      </div>
      <p className={cn("mt-1 flex items-baseline gap-0.5", tone)}>
        <span className="numeric truncate text-sm font-bold leading-none">{value}</span>
        {unit && <span className="shrink-0 text-[9px] text-ink-muted">{unit}</span>}
      </p>
      {detail && (
        <p className="mt-0.5 truncate text-[9px] leading-none text-ink-subtle">
          {detail}
        </p>
      )}
    </div>
  );
}

export function ConditionsPanel({
  heading,
  now,
  days,
}: {
  heading: string;
  /** "עכשיו 26° · 2 קשר" — today's live reading, or null out of hours. */
  now: string | null;
  days: DayView[];
}) {
  const [dayIndex, setDayIndex] = useState(0);
  const [periodIndex, setPeriodIndex] = useState(
    days[0]?.initialPeriod ?? 0,
  );

  const day = days[dayIndex];
  const period = day?.periods[periodIndex] ?? day?.periods[0];

  if (!day || !period) {
    return (
      <div className="card flex flex-col gap-2 p-4">
        <TileLabel>{heading}</TileLabel>
        <p className="text-xs text-ink-subtle">לא זמין כרגע</p>
      </div>
    );
  }

  const Icon = ICONS[period.icon as keyof typeof ICONS] ?? Sun;

  function selectDay(index: number) {
    setDayIndex(index);
    // Only today has a "current" window; every other day opens on the morning.
    setPeriodIndex(days[index]?.initialPeriod ?? 0);
  }

  return (
    <div className="card flex flex-col gap-2 p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <TileLabel>{heading}</TileLabel>
        {now && (
          <span className="numeric shrink-0 text-[10px] text-ink-subtle">{now}</span>
        )}
      </div>

      {/* Days. Scrolls rather than wraps, so five days never push the card
          taller on a narrow phone. */}
      <div
        role="tablist"
        aria-label="ימי התחזית"
        className="no-scrollbar flex gap-1 overflow-x-auto"
      >
        {days.map((item, index) => {
          const selected = index === dayIndex;
          return (
            <button
              key={item.date}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => selectDay(index)}
              className={cn(
                "flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-2.5 py-1 transition",
                selected
                  ? "bg-teal-400 text-hull-950"
                  : "bg-hull-850 text-ink-muted hover:text-ink",
              )}
            >
              <span
                className={cn(
                  "whitespace-nowrap text-[11px] leading-tight",
                  selected && "font-semibold",
                )}
              >
                {item.label}
              </span>
              <span className="flex items-center gap-1">
                <span className="numeric text-[9px] leading-none opacity-70">
                  {item.sub}
                </span>
                {!selected && (
                  <span
                    className={cn("size-1 rounded-full", TONE_DOT[item.tone])}
                    aria-hidden
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* The three windows a sail is actually planned in. */}
      <div
        role="tablist"
        aria-label="שעות היום"
        className="flex gap-1 rounded-xl border border-[var(--hairline)] bg-hull-850 p-0.5"
      >
        {day.periods.map((item, index) => {
          const selected = index === periodIndex;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setPeriodIndex(index)}
              className={cn(
                "flex-1 rounded-lg px-1 py-1 text-center transition",
                selected
                  ? "bg-teal-400 text-hull-950"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              <span
                className={cn(
                  "block truncate text-[11px] leading-tight",
                  selected && "font-semibold",
                )}
              >
                {item.label}
              </span>
              <span className="numeric block text-[9px] leading-none opacity-70">
                {item.clock}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <Reading
          icon={<Icon className="size-3" aria-hidden />}
          label="מזג אוויר"
          value={period.temp}
          detail={period.condition}
        />
        <Reading
          icon={<Wind className="size-3" aria-hidden />}
          label="רוח"
          value={period.wind}
          unit="קשר"
          detail={period.windDetail}
        />
        <Reading
          icon={<Zap className="size-3" aria-hidden />}
          label="משבים"
          value={period.gust}
          unit="קשר"
          tone={period.gustWarn ? "text-warning" : undefined}
        />
        <Reading
          icon={<Waves className="size-3" aria-hidden />}
          label="גלים"
          value={period.wave}
          unit={period.wave === "—" ? undefined : "מ׳"}
          detail={period.waveDetail}
        />
      </div>

      <p
        className={cn(
          "flex items-center gap-1.5 text-[11px] font-medium",
          TONE_TEXT[period.verdict.tone],
        )}
      >
        {period.verdict.tone === "good" ? (
          <Waves className="size-3 shrink-0" aria-hidden />
        ) : (
          <TriangleAlert className="size-3 shrink-0" aria-hidden />
        )}
        {period.verdict.label}
      </p>
    </div>
  );
}
