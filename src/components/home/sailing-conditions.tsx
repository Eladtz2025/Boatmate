import { TileLabel } from "@/components/ui/card";
import {
  CALM_GUST_KN,
  DAY_PERIODS,
  GUSTY_NOW_KN,
  TEL_AVIV,
  dayDate,
  dayLabel,
  dayTone,
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
 * Which window the clock is standing in, or null when it is outside all three
 * — before 08:00 or after 20:00, when "now" belongs to no sailing window at
 * all. Only today can have one.
 */
function currentPeriod(isToday: boolean, hour: number): number | null {
  if (!isToday) return null;
  const index = DAY_PERIODS.findIndex(
    (period) => hour >= period.fromHour && hour < period.toHour,
  );
  return index === -1 ? null : index;
}

/**
 * The window to open a day on.
 *
 * Today opens on the window the clock is in, because "can I go out" is a
 * question about the next few hours; every other day opens on the morning,
 * which is where a plan starts. Before 08:00 the morning is still ahead;
 * after 20:00 nothing is, so it rests on the last window rather than
 * pretending the morning has not gone.
 */
function initialPeriod(isToday: boolean, hour: number): number {
  if (!isToday) return 0;
  const now = currentPeriod(isToday, hour);
  if (now !== null) return now;
  return hour < DAY_PERIODS[0].fromHour ? 0 : DAY_PERIODS.length - 1;
}

function toDayView(day: DailyForecast, isToday: boolean, hour: number): DayView {
  return {
    date: day.date,
    label: dayLabel(day.date),
    sub: dayDate(day.date),
    // From the day's own windows, so the dot and the panel it opens cannot
    // tell different stories about the same day.
    tone: dayTone(day.periods),
    periods: day.periods.map((period, index) =>
      toPeriodView(DAY_PERIODS[index], period),
    ),
    initialPeriod: initialPeriod(isToday, hour),
    nowPeriod: currentPeriod(isToday, hour),
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

  // The live reading, shown only while the window it belongs to is the one on
  // screen — `nowPeriod` on today's view. Floating it above whichever window
  // happened to be selected put an instant's numbers next to a four-hour
  // summary of a different part of a different day, which reads as the card
  // contradicting itself even though both figures are true.
  const gusty = weather.windGustKn >= GUSTY_NOW_KN;
  const now =
    `עכשיו ${weather.temperature}° · ${weather.windSpeedKn} קשר` +
    (gusty ? ` · משבים ${weather.windGustKn}` : "");

  return <ConditionsPanel heading={HEADING} now={now} days={days} />;
}
