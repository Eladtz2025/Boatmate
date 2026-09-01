import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeft, Moon, ReceiptText, Sun, Users } from "lucide-react";
import { AppHeader } from "@/components/nav/app-header";
import { BoatHero } from "@/components/home/boat-hero";
import {
  SailingConditions,
  SailingConditionsSkeleton,
} from "@/components/home/sailing-conditions";
import { ChecklistCard } from "@/components/home/checklist-card";
import { GalleryTrigger, PhotoGallery } from "@/components/home/photo-gallery";
import { Card, TileLabel } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { STAY_LABEL, STRIP_DAYS } from "@/lib/attendance";
import { addDaysToKey, todayKey } from "@/lib/tz";
import { formatDayMonth, daysUntil } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  getAttendance,
  getBoat,
  getChecklist,
  getDocuments,
  getGalleryPhotos,
  getMembers,
} from "@/lib/data";

export const metadata = { title: "הבית — Boatmate" };

/**
 * The home screen answers three questions and stops: what is the sea doing,
 * what does the boat need, and who is coming. The balance tile, the open-task
 * summary and the four-way shortcut row are gone — every one of them was a
 * second door into a screen the bottom nav already reaches, and they were what
 * made this page a directory instead of a dashboard.
 */
export default async function HomePage() {
  const boat = await getBoat();
  if (!boat) return null; // layout redirects to /onboarding

  const today = todayKey();

  const [members, attendance, checklist, photos, documents] = await Promise.all([
    getMembers(boat.id),
    getAttendance(boat.id, today, addDaysToKey(today, STRIP_DAYS - 1)),
    getChecklist(boat.id),
    getGalleryPhotos(boat.id, boat.photoPath),
    getDocuments(boat.id),
  ]);

  // Anything expired or inside its reminder window counts as an alert.
  const alerts = documents.filter(
    (doc) =>
      doc.expiresOn !== null && daysUntil(doc.expiresOn) <= doc.reminderDays,
  ).length;

  // Hero first, so this is the photo the gallery also opens on.
  const heroUrl = photos[0]?.url ?? null;

  const nameOf = new Map(members.map((member) => [member.userId, member]));
  const nextArrivals = attendance.slice(0, 3);

  return (
    <main className="flex-1 pb-24">
      <PhotoGallery boatId={boat.id} photos={photos} openNew={false}>
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

        <div className="mt-4 space-y-3 px-4">
          {/* Suspense so a cold forecast streams in rather than holding up the
              whole page; on a warm cache it renders straight into the HTML. */}
          <Suspense fallback={<SailingConditionsSkeleton />}>
            <SailingConditions />
          </Suspense>

          <ChecklistCard boatId={boat.id} items={checklist} />

          {/* Partner arrival — the calendar's answer, surfaced. Tapping it goes
              to the strip where the answer can be changed. */}
          <Link href="/calendar" className="block">
            <Card className="transition active:scale-[0.99] hover:border-teal-400/30">
              <div className="mb-2 flex items-center justify-between">
                <TileLabel>הגעת שותף</TileLabel>
                <span className="flex items-center gap-1 text-teal-400">
                  <Users className="size-4" aria-hidden />
                  <ChevronLeft className="size-3.5" aria-hidden />
                </span>
              </div>

              {nextArrivals.length === 0 ? (
                <p className="text-xs text-ink-subtle">לא מתוכננת הגעה</p>
              ) : (
                <ul className="space-y-2">
                  {nextArrivals.map((row) => {
                    const member = nameOf.get(row.userId);
                    const Icon = row.stay === "overnight" ? Moon : Sun;

                    return (
                      <li key={row.eventId} className="flex items-center gap-2.5">
                        <Avatar
                          name={member?.name ?? "שותף"}
                          color={member?.color}
                          size="xs"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">
                          {member?.name ?? "שותף"}
                        </span>
                        <span className="numeric shrink-0 text-xs text-ink-muted">
                          {formatDayMonth(row.dateKey)}
                        </span>
                        <Icon
                          className={cn(
                            "size-3.5 shrink-0",
                            row.stay === "overnight"
                              ? "text-ink-muted"
                              : "text-warning",
                          )}
                          aria-label={STAY_LABEL[row.stay]}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </Link>

          {/* New expense — the one thing on this screen that is a shortcut, and
              the only one that earned its place: it is written down at the till,
              not later. */}
          <Link
            href="/finances?new=expense"
            className="card flex items-center gap-3 p-4 transition active:scale-[0.99] hover:border-teal-400/30"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-teal-400/15 text-teal-400">
              <ReceiptText className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">הוצאה חדשה</span>
              <span className="block text-xs text-ink-muted">
                רישום תשלום וחלוקה בין השותפים
              </span>
            </span>
            <ChevronLeft className="size-4 shrink-0 text-ink-subtle" aria-hidden />
          </Link>
        </div>
      </PhotoGallery>
    </main>
  );
}
