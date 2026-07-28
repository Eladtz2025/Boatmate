import { Suspense } from "react";
import Link from "next/link";
import { Plane, Scale } from "lucide-react";
import { AppHeader } from "@/components/nav/app-header";
import { BoatHero } from "@/components/home/boat-hero";
import {
  SailingConditions,
  SailingConditionsSkeleton,
} from "@/components/home/sailing-conditions";
import { QuickActions } from "@/components/home/quick-actions";
import {
  GalleryTrigger,
  PhotoGallery,
} from "@/components/home/photo-gallery";
import { TasksCard } from "@/components/home/tasks-card";
import { Card, TileLabel } from "@/components/ui/card";
import { headlineSettlement } from "@/lib/balance";
import { formatAgorotAbs, formatDateRange, daysUntil } from "@/lib/format";
import {
  getBalances,
  getBoat,
  getDocuments,
  getGalleryPhotos,
  getMemberNames,
  getNextArrival,
  getOpenTasks,
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

  const [balances, names, arrival, tasks, photos, documents] =
    await Promise.all([
      getBalances(boat.id),
      getMemberNames(boat.id),
      getNextArrival(boat.id),
      getOpenTasks(boat.id),
      getGalleryPhotos(boat.id, boat.photoPath),
      getDocuments(boat.id),
    ]);

  const headline = headlineSettlement(balances);

  // Anything expired or inside its reminder window counts as an alert.
  const alerts = documents.filter(
    (doc) =>
      doc.expiresOn !== null && daysUntil(doc.expiresOn) <= doc.reminderDays,
  ).length;

  // Hero first, so this is the photo the gallery also opens on.
  const heroUrl = photos[0]?.url ?? null;

  return (
    <main className="flex-1 pb-24">
      <PhotoGallery
        boatId={boat.id}
        photos={photos}
        openNew={wantsNewPhoto(params.new)}
      >
        <AppHeader
          boatName={boat.name}
          tagline={boat.tagline}
          alertCount={alerts}
        />

        {/* Tapping the hero opens the viewer on it. With no photos at all it
            opens the upload sheet instead — that is what the tap is asking for. */}
        <GalleryTrigger label="פתיחת גלריית התמונות">
          <BoatHero
            photoUrl={heroUrl}
            statusText={boat.statusText}
            boatName={boat.name}
          />
        </GalleryTrigger>

        {/* Conditions get the full width: four readings plus the verdict do not
            fit a half tile, and it is the first thing anyone opens the app for. */}
        <div className="mt-4 px-4">
          {/* Suspense so a cold forecast streams in rather than holding up the
              whole page; on a warm cache it renders straight into the HTML. */}
          <Suspense fallback={<SailingConditionsSkeleton />}>
            <SailingConditions />
          </Suspense>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 px-4">
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

          {/* Full width: there was a photo tile beside this, but the hero photo
              is the way into the gallery now and a second door to the same room
              was not worth a grid slot. Task titles get the room instead. */}
          <TasksCard tasks={tasks} className="col-span-2" />
        </div>

        <div className="mt-4 px-4">
          <QuickActions />
        </div>
      </PhotoGallery>
    </main>
  );
}
