import Link from "next/link";
import Image from "next/image";
import { CalendarClock, ImageIcon, Plane, Scale } from "lucide-react";
import { AppHeader } from "@/components/nav/app-header";
import { BoatHero } from "@/components/home/boat-hero";
import { WeatherCard } from "@/components/home/weather-card";
import { QuickActions } from "@/components/home/quick-actions";
import { PhotoLauncher } from "@/components/home/photo-launcher";
import { TasksCard } from "@/components/home/tasks-card";
import { Card, TileLabel } from "@/components/ui/card";
import { headlineSettlement } from "@/lib/balance";
import { BUCKETS } from "@/lib/constants";
import {
  formatAgorotAbs,
  formatDateRange,
  formatDayMonth,
  formatTime,
  daysUntil,
} from "@/lib/format";
import {
  getBalances,
  getBoat,
  getDocuments,
  getMemberNames,
  getNextArrival,
  getNextEvent,
  getOpenTasks,
  getRecentMedia,
  getSignedUrl,
} from "@/lib/data";

export const metadata = { title: "הבית — Boatmate" };

/** `?new=photo` — the home quick action links here. */
const wantsNewPhoto = (value: string | string[] | undefined): boolean =>
  (Array.isArray(value) ? value[0] : value) === "photo";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string | string[] }>;
}) {
  const [params, boat] = await Promise.all([searchParams, getBoat()]);
  if (!boat) return null; // layout redirects to /onboarding

  const [balances, names, nextEvent, arrival, tasks, media, documents, heroUrl] =
    await Promise.all([
      getBalances(boat.id),
      getMemberNames(boat.id),
      getNextEvent(boat.id),
      getNextArrival(boat.id),
      getOpenTasks(boat.id),
      getRecentMedia(boat.id),
      getDocuments(boat.id),
      getSignedUrl(BUCKETS.media, boat.photoPath),
    ]);

  const headline = headlineSettlement(balances);

  // Anything expired or inside its reminder window counts as an alert.
  const alerts = documents.filter(
    (doc) =>
      doc.expiresOn !== null && daysUntil(doc.expiresOn) <= doc.reminderDays,
  ).length;

  const mediaUrls = (
    await Promise.all(
      media.slice(0, 3).map((item) => getSignedUrl(BUCKETS.media, item.path)),
    )
  ).filter((url): url is string => url !== null);

  return (
    <main className="flex-1 pb-24">
      <AppHeader
        boatName={boat.name}
        tagline={boat.tagline}
        alertCount={alerts}
      />

      <BoatHero
        photoUrl={heroUrl}
        statusText={boat.statusText}
        boatName={boat.name}
      />

      <div className="mt-4 grid grid-cols-2 gap-3 px-4">
        <WeatherCard latitude={boat.latitude} longitude={boat.longitude} />

        {/* Next event */}
        <Card className="flex flex-col gap-2">
          <TileLabel>האירוע הבא</TileLabel>
          {nextEvent ? (
            <>
              <p className="line-clamp-2 text-sm font-semibold leading-snug">
                {nextEvent.title}
              </p>
              <p className="numeric mt-auto text-xs text-ink-muted">
                {formatDayMonth(nextEvent.startsAt)}
              </p>
              {!nextEvent.allDay && (
                <p className="numeric flex items-center gap-1 text-xs text-teal-400">
                  <CalendarClock className="size-3.5" aria-hidden />
                  {formatTime(nextEvent.startsAt)}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-ink-subtle">אין אירועים קרובים</p>
          )}
        </Card>

        {/* Partner arrival */}
        <Card className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <TileLabel>הגעת שותף</TileLabel>
            <Plane className="size-4 text-teal-400" aria-hidden />
          </div>
          {arrival ? (
            <>
              <p className="line-clamp-2 text-sm font-medium leading-snug">
                {arrival.title}
              </p>
              <p className="numeric mt-auto text-xs text-ink-muted">
                {formatDateRange(arrival.starts_at, arrival.ends_at)}
              </p>
            </>
          ) : (
            <p className="text-xs text-ink-subtle">לא מתוכננת הגעה</p>
          )}
        </Card>

        {/* Balance */}
        <Card className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <TileLabel>יתרה בין שותפים</TileLabel>
            <Scale className="size-4 text-teal-400" aria-hidden />
          </div>

          {headline ? (
            <>
              <p className="text-xs leading-snug text-ink-muted">
                {names[headline.fromUser] ?? "שותף"} חייב ל
                {names[headline.toUser] ?? "שותף"}
              </p>
              <p className="numeric text-2xl font-bold leading-none">
                {formatAgorotAbs(headline.amountAgorot)}
              </p>
            </>
          ) : (
            <p className="text-sm font-medium text-teal-400">כולם מאוזנים</p>
          )}

          <Link
            href="/finances"
            className="mt-auto rounded-full bg-teal-400 px-3 py-1.5 text-center text-xs font-semibold text-hull-950 transition hover:bg-teal-500"
          >
            צפה בפירוט
          </Link>
        </Card>

        <TasksCard tasks={tasks} />

        {/* Recent photos */}
        <Card className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <TileLabel>תמונות אחרונות</TileLabel>
            <ImageIcon className="size-4 text-ink-subtle" aria-hidden />
          </div>

          {mediaUrls.length > 0 ? (
            <div className="flex items-center gap-1.5">
              {mediaUrls.map((url) => (
                <div
                  key={url}
                  className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-[var(--hairline)]"
                >
                  <Image
                    src={url}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                </div>
              ))}
              {media.length > mediaUrls.length && (
                <span className="numeric flex size-12 shrink-0 items-center justify-center rounded-lg bg-hull-750 text-xs font-medium text-ink-muted">
                  +{media.length - mediaUrls.length}
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-ink-subtle">עדיין אין תמונות</p>
          )}
        </Card>
      </div>

      <div className="mt-4 px-4">
        <QuickActions />
      </div>

      <PhotoLauncher boatId={boat.id} openNew={wantsNewPhoto(params.new)} />
    </main>
  );
}
