import type { ReactNode } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Eye,
  Snowflake,
  Sailboat,
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
  CALM_GUST_KN,
  TEL_AVIV,
  calmWindow,
  conditionSpell,
  dailyVerdict,
  dayDate,
  dayLabel,
  describeWeather,
  formatWindow,
  hoursUntilSunset,
  isGusty,
  sailingVerdict,
  seaStateLabel,
  windDirectionShort,
  type DailyForecast,
  type HourReading,
  type Verdict,
  type Weather,
} from "@/lib/weather";
import { getConditions } from "@/lib/weather-data";
import { cn } from "@/lib/cn";
import { ConditionsCarousel, type DayTab } from "./conditions-carousel";

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

const HEADING = `תנאי הפלגה · ${TEL_AVIV.label}`;

/** How many days the carousel pages through — today plus the next four. */
const PANELS = 5;

/** The hour it is right now in Tel Aviv — the server clock is UTC. */
function telAvivHour(): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      timeZone: TEL_AVIV.timeZone,
    }).format(new Date()),
  );
}

/**
 * Wind hour by hour, which is the whole reason this card grew a forecast:
 * a summer day here is glass until noon and a full breeze by two, and one
 * number for the day describes neither half of it.
 *
 * The steady wind, not the gusts. The gust reading runs ~3× the wind here at
 * every hour, so a gust profile painted a normal sea-breeze afternoon amber
 * while the sailor it was written for was looking at six knots of lovely
 * wind — the bars have to answer the question they are asked, "מה הרוח
 * עכשיו". The calm window underneath still reads gusts, where squalls belong.
 * The scale is floored at 10 so a glassy morning still shows its shape.
 * Laid out right-to-left like everything else in the app — the hour labels
 * underneath keep it unambiguous.
 */
function WindProfile({ hours }: { hours: HourReading[] }) {
  const peak = Math.max(10, ...hours.map((hour) => hour.windSpeedKn));

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px] text-ink-muted">
        <span>רוח לפי שעה</span>
        <span className="numeric text-ink-subtle">קשר</span>
      </div>

      <div className="relative h-12">
        <div className="flex h-full items-end gap-px">
          {hours.map((hour) => (
            <div
              key={hour.hour}
              className="min-h-px flex-1 rounded-t-sm bg-teal-400/70"
              style={{ height: `${(hour.windSpeedKn / peak) * 100}%` }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-px">
        {hours.map((hour) => (
          <span
            key={hour.hour}
            className="numeric flex-1 text-center text-[9px] leading-none text-ink-subtle"
          >
            {hour.hour % 4 === 0 ? String(hour.hour).padStart(2, "0") : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** "⛵ הכי רגוע: 06:00–11:00" — the line the card exists to produce. */
function CalmWindowLine({ hours }: { hours: HourReading[] }) {
  const window = calmWindow(hours);

  if (!window) {
    return (
      <p className="text-[11px] text-ink-subtle">
        המשבים לא יורדים מתחת ל<span className="numeric">{CALM_GUST_KN}</span>{" "}
        קשר לאורך היום
      </p>
    );
  }

  const inWindow = hours.filter(
    (hour) => hour.hour >= window.fromHour && hour.hour < window.toHour,
  );
  const gust = Math.max(0, ...inWindow.map((hour) => hour.windGustKn));

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-teal-400">
      <Sailboat className="size-3.5 shrink-0" aria-hidden />
      <span className="font-medium">
        הכי רגוע: <span className="numeric">{formatWindow(window)}</span>
      </span>
      <span className="text-ink-subtle">
        משבים עד <span className="numeric">{gust}</span> קשר
      </span>
    </p>
  );
}

/** Named zone, always: the server renders this in UTC. */
function formatClock(instant: string | null): string | null {
  if (!instant) return null;
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TEL_AVIV.timeZone,
  });
}

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

/** Big temperature, condition, weather glyph — shared by every panel. */
function PanelHeader({
  temperature,
  weatherCode,
  secondary,
}: {
  temperature: number;
  weatherCode: number;
  secondary?: ReactNode;
}) {
  const { label, icon } = describeWeather(weatherCode);
  const Icon = ICONS[icon as keyof typeof ICONS] ?? Sun;

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="flex items-baseline gap-2">
          <span className="numeric text-3xl font-bold leading-none">
            {temperature}°
          </span>
          <span className="truncate text-sm text-ink-muted">{label}</span>
        </p>
        {secondary && (
          <p className="mt-0.5 text-[11px] text-ink-subtle">{secondary}</p>
        )}
      </div>
      <Icon className="size-8 shrink-0 text-warning" aria-hidden />
    </div>
  );
}

/** The verdict line every panel closes with. */
function VerdictLine({ verdict }: { verdict: Verdict }) {
  return (
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
  );
}

/** Now: live readings, and the two extras only the current hour has —
 *  visibility and how much daylight is left to use. */
function TodayPanel({
  weather,
  today,
}: {
  weather: Weather;
  today: DailyForecast | undefined;
}) {
  const gusty = isGusty(weather.windGustKn);
  const daylightLeft = hoursUntilSunset(weather.sunset);
  const sunsetTime = formatClock(weather.sunset);

  // Hours already gone are noise on today's panel — the profile here answers
  // "when should we go out from now", not "what did this morning look like".
  const currentHour = telAvivHour();
  const remaining =
    today?.hours.filter((hour) => hour.hour >= currentHour) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <PanelHeader
        temperature={weather.temperature}
        weatherCode={weather.weatherCode}
        secondary={
          weather.apparentTemperature !== weather.temperature ? (
            <>
              מרגיש כמו{" "}
              <span className="numeric">{weather.apparentTemperature}°</span>
            </>
          ) : undefined
        }
      />

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

      {/* Two bars is not a profile; late in the day there is nothing to plot. */}
      {remaining.length >= 3 && <WindProfile hours={remaining} />}

      <div className="flex flex-col gap-1.5 border-t border-[var(--hairline)] pt-2.5">
        <VerdictLine verdict={sailingVerdict(weather)} />

        {remaining.length >= 3 && <CalmWindowLine hours={remaining} />}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-subtle">
          {sunsetTime && (
            <span className="flex items-center gap-1">
              <Sunset className="size-3 shrink-0" aria-hidden />
              שקיעה <span className="numeric">{sunsetTime}</span>
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

/**
 * A day ahead. Same rhythm as today so swiping does not reshuffle the layout,
 * but wind and gust are given as the range across daylight rather than as one
 * number — and the profile underneath shows where in the day each end of that
 * range falls, which is the part a single figure can never carry.
 */
/**
 * Weather the headline deliberately does not carry, and when it falls —
 * "מינימום 23° · ערפל 07:00–09:00" beneath a day billed as clear.
 *
 * Softening the headline must not lose the fog, only stop it renaming a day it
 * held for one hour. Nothing milder than fog earns a line: the difference
 * between a clear hour and a partly cloudy one is not news to anyone.
 */
function daySpell(day: DailyForecast) {
  if (day.severeCode < 45) return null;

  const label = describeWeather(day.severeCode).label;
  if (label === describeWeather(day.weatherCode).label) return null;

  const window = conditionSpell(day.hours, day.severeCode);
  return window ? { label, window } : null;
}

function DayPanel({ day }: { day: DailyForecast }) {
  const sunsetTime = formatClock(day.sunset);
  const spell = daySpell(day);

  return (
    <div className="flex flex-col gap-3">
      <PanelHeader
        temperature={day.tempMax}
        weatherCode={day.weatherCode}
        secondary={
          <>
            מינימום <span className="numeric">{day.tempMin}°</span>
            {spell && (
              <>
                {" · "}
                {spell.label}{" "}
                <span className="numeric">{formatWindow(spell.window)}</span>
              </>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2">
        <Reading
          icon={<Waves className="size-3.5" aria-hidden />}
          label="גובה גלים"
          value={day.waveHeight === null ? "—" : day.waveHeight.toFixed(1)}
          unit={day.waveHeight === null ? undefined : "מ׳"}
          detail={seaStateLabel(day.waveHeight, day.windMaxKn)}
        />

        <Reading
          icon={<Wind className="size-3.5" aria-hidden />}
          label="רוח"
          value={`${day.windMinKn}-${day.windMaxKn}`}
          unit="קשר"
          detail={`מכיוון ${windDirectionShort(day.windDirection)}`}
        />

        <Reading
          icon={<Zap className="size-3.5" aria-hidden />}
          label="משבים"
          value={`${day.gustMinKn}-${day.gustMaxKn}`}
          unit="קשר"
          detail={day.gustMaxKn >= CALM_GUST_KN ? "מתחזק בצהריים" : undefined}
          tone={day.gustMaxKn >= CALM_GUST_KN ? "text-warning" : undefined}
        />

        <Reading
          icon={<Sunset className="size-3.5" aria-hidden />}
          label="שקיעה"
          value={sunsetTime ?? "—"}
        />
      </div>

      {day.hours.length > 0 && <WindProfile hours={day.hours} />}

      <div className="flex flex-col gap-1.5 border-t border-[var(--hairline)] pt-2.5">
        <VerdictLine verdict={dailyVerdict(day)} />
        {day.hours.length > 0 && <CalmWindowLine hours={day.hours} />}
      </div>
    </div>
  );
}

/** Shown by Suspense while the forecast is cold. On a warm cache — which is
 *  almost always, the fetch holds for 15 minutes — this never appears. */
export function SailingConditionsSkeleton() {
  return (
    <div className="card flex animate-pulse flex-col gap-3 p-4">
      <TileLabel>{HEADING}</TileLabel>
      <div className="h-11 rounded-2xl bg-hull-850" />
      <div className="h-8 w-20 rounded-lg bg-hull-750" />
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((tile) => (
          <div key={tile} className="h-20 rounded-2xl bg-hull-750" />
        ))}
      </div>
    </div>
  );
}

/**
 * The sailing card: weather, waves, wind and gust for Tel Aviv in one place,
 * with the judgement call spelled out underneath rather than left to the
 * reader — today, and swipeable through the next four days.
 *
 * A Server Component on purpose. As a client component it re-fetched on every
 * mount, so the skeleton flashed on each visit to the home screen even when the
 * data was already cached. Only the paging is client-side.
 */
export async function SailingConditions() {
  const weather = await getConditions();

  if (!weather) {
    return (
      <div className="card flex flex-col gap-2 p-4">
        <TileLabel>{HEADING}</TileLabel>
        <p className="text-xs text-ink-subtle">לא זמין כרגע</p>
      </div>
    );
  }

  // days[0] is today, and its aggregates are not what the first panel shows —
  // that one renders the live readings. Everything after it is the outlook.
  const today = weather.days[0];
  const outlook = weather.days.slice(1, PANELS);

  // The dot on each tab answers one question across all five days — "is there
  // a window on this day?" — so today's is drawn the same way as the rest. The
  // verdict *line* inside today's panel still reports the live conditions,
  // which is a different question and can honestly differ: blowing right now,
  // and calm again by six.
  const tabs: DayTab[] = [
    {
      label: "היום",
      sub: today ? dayDate(today.date) : "",
      tone: today ? dailyVerdict(today).tone : sailingVerdict(weather).tone,
    },
    ...outlook.map((day) => ({
      label: dayLabel(day.date),
      sub: dayDate(day.date),
      tone: dailyVerdict(day).tone,
    })),
  ];

  return (
    <div className="card flex flex-col gap-3 p-4">
      <TileLabel>{HEADING}</TileLabel>

      <ConditionsCarousel tabs={tabs}>
        <TodayPanel weather={weather} today={today} />
        {outlook.map((day) => (
          <DayPanel key={day.date} day={day} />
        ))}
      </ConditionsCarousel>
    </div>
  );
}
