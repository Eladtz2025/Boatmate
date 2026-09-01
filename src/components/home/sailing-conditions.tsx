import { TileLabel } from "@/components/ui/card";
import {
  CALM_GUST_KN,
  DAY_PERIODS,
  GUSTY_NOW_KN,
  TEL_AVIV,
  dailyVerdict,
  dayDate,
  dayLabel,
  describeWeather,
  periodVerdict,
  seaStateLabel,
  windDirectionShort,
  type DailyForecast,
  type PeriodForecast,
} from "@/lib/weather";
import { getConditions } from "@/lib/weather-data";
import {
  ConditionsPanel,
  type DayView,
  type PeriodView,
} from "./conditions-panel";

const HEADING = `תנאי הפלגה · ${TEL_AVIV.label}`;

/** How many days the card pages through — today plus the next four. */
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

/** Missing is "—", never a stand-in zero. */
const orDash = (value: number | null, digits = 0): string =>
  value === null ? "—" : value.toFixed(digits);

function windRange(period: PeriodForecast): string {
  if (period.windMinKn === null || period.windMaxKn === null) return "—";
  return period.windMinKn === period.windMaxKn
    ? String(period.windMaxKn)
    : `${period.windMinKn}-${period.windMaxKn}`;
}

function toPeriodView(
  meta: (typeof DAY_PERIODS)[number],
  period: PeriodForecast,
): PeriodView {
  const available = period.hours.length > 0;
  const weather = describeWeather(period.weatherCode ?? 0);

  return {
    key: period.key,
    label: meta.label,
    clock: meta.clock,
    available,
    temp: period.tempMaxC === null ? "—" : `${Math.round(period.tempMaxC)}°`,
    condition: available ? weather.label : "אין נתונים",
    icon: available ? weather.icon : "cloud",
    wind: windRange(period),
    windDetail:
      period.windDirection === null
        ? ""
        : `מכיוון ${windDirectionShort(period.windDirection)}`,
    gust: period.gustMaxKn === null ? "—" : String(period.gustMaxKn),
    gustWarn: (period.gustMaxKn ?? 0) >= CALM_GUST_KN,
    wave: orDash(period.waveHeight, 1),
    waveDetail:
      period.waveHeight === null
        ? "אין נתוני ים"
        : seaStateLabel(period.waveHeight, period.windMaxKn ?? 0),
    verdict: periodVerdict(period),
  };
}

/**
 * The window to open a day on.
 *
 * Today opens on the window the clock is in, because "can I go out" is a
 * question about the next few hours; every other day opens on the morning,
 * which is where a plan starts. Past 20:00 there is no window left today, so
 * it falls back to the last one rather than pretending the morning is ahead.
 */
function initialPeriod(isToday: boolean, hour: number): number {
  if (!isToday) return 0;
  const index = DAY_PERIODS.findIndex((period) => hour < period.toHour);
  return index === -1 ? DAY_PERIODS.length - 1 : index;
}

function toDayView(day: DailyForecast, isToday: boolean, hour: number): DayView {
  return {
    date: day.date,
    label: dayLabel(day.date),
    sub: dayDate(day.date),
    tone: dailyVerdict(day).tone,
    periods: day.periods.map((period, index) =>
      toPeriodView(DAY_PERIODS[index], period),
    ),
    initialPeriod: initialPeriod(isToday, hour),
  };
}

/** Shown by Suspense while the forecast is cold. On a warm cache — which is
 *  almost always, the fetch holds for 15 minutes — this never appears. */
export function SailingConditionsSkeleton() {
  return (
    <div className="card flex animate-pulse flex-col gap-2 p-3.5">
      <TileLabel>{HEADING}</TileLabel>
      <div className="h-9 rounded-xl bg-hull-850" />
      <div className="h-8 rounded-xl bg-hull-850" />
      <div className="grid grid-cols-4 gap-1.5">
        {[0, 1, 2, 3].map((tile) => (
          <div key={tile} className="h-12 rounded-xl bg-hull-750" />
        ))}
      </div>
    </div>
  );
}

/**
 * The sailing card: five days, each split into 08–12, 12–16 and 16–20, every
 * window read from its own hours of the provider's series.
 *
 * A Server Component on purpose. As a client component it re-fetched on every
 * mount, so the skeleton flashed on each visit to the home screen even when the
 * data was already cached. Only the day and window selection is client-side,
 * and it selects between values already computed here — which is also what
 * keeps the timezone handling in one place, on the machine that knows it is
 * running in UTC.
 */
export async function SailingConditions() {
  const weather = await getConditions();

  if (!weather) {
    return (
      <div className="card flex flex-col gap-2 p-3.5">
        <TileLabel>{HEADING}</TileLabel>
        <p className="text-xs text-ink-subtle">לא זמין כרגע</p>
      </div>
    );
  }

  const hour = telAvivHour();
  const days = weather.days
    .slice(0, PANELS)
    .map((day, index) => toDayView(day, index === 0, hour));

  // The live line is a fact about this minute, kept deliberately separate from
  // the window summaries: "right now" and "this afternoon" are different
  // questions and are allowed to disagree.
  const gusty = weather.windGustKn >= GUSTY_NOW_KN;
  const now =
    `עכשיו ${weather.temperature}° · ${weather.windSpeedKn} קשר` +
    (gusty ? ` · משבים ${weather.windGustKn}` : "");

  return <ConditionsPanel heading={HEADING} now={now} days={days} />;
}
