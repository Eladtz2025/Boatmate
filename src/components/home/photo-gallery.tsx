"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImagePlus, Star, Trash2, X } from "lucide-react";
import { deleteMedia, updateBoat } from "@/app/actions";
import { HERO_PHOTO_ID, type GalleryPhoto } from "@/lib/gallery";
import { cn } from "@/lib/cn";
import { PhotoSheet } from "./photo-sheet";

type GalleryApi = {
  /** Opens the viewer on a given photo, or on the first one. */
  open: (photoId?: string) => void;
  openUpload: () => void;
  count: number;
};

const GalleryContext = createContext<GalleryApi | null>(null);

export function useGallery(): GalleryApi {
  const api = useContext(GalleryContext);
  if (!api) throw new Error("useGallery must be used inside <PhotoGallery>");
  return api;
}

/**
 * Anything wrapped in this opens the viewer when tapped. Used for the hero
 * photo, which stays a Server Component — it is passed through as children
 * rather than reimplemented here.
 */
export function GalleryTrigger({
  photoId,
  label,
  className,
  children,
}: {
  photoId?: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const { open } = useGallery();

  return (
    <button
      type="button"
      onClick={() => open(photoId)}
      aria-label={label}
      className={cn("block w-full text-start transition active:scale-[0.99]", className)}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Viewer                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Full-screen photo viewer.
 *
 * Paging is native scroll-snap, so a swipe is a real swipe and pinch-to-zoom
 * keeps working — a custom gesture handler would have taken both away, and
 * seeing the photo properly is the whole point of this screen. The active photo
 * is read back with an IntersectionObserver because `scrollLeft` counts down
 * from zero under `dir="rtl"` and disagrees between browsers.
 */
function Viewer({
  boatId,
  photos,
  startId,
  onClose,
  onAdd,
  /** The upload sheet is layered on top; it owns Escape while it is open. */
  suspended,
}: {
  boatId: string;
  photos: GalleryPhoto[];
  startId: string | null;
  onClose: () => void;
  onAdd: () => void;
  suspended: boolean;
}) {
  const router = useRouter();
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(() => {
    const found = photos.findIndex((photo) => photo.id === startId);
    return found === -1 ? 0 : found;
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  // A delete refreshes the page, so the list can shrink underneath the viewer.
  const safeIndex = Math.min(index, Math.max(0, photos.length - 1));
  const current = photos[safeIndex];

  useEffect(() => {
    if (photos.length === 0) onClose();
  }, [photos.length, onClose]);

  // Jump to the requested photo before the first paint, without animating past
  // everything in between.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.children[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    // Deliberately runs once: afterwards the scroll position is the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio < 0.6) continue;
          const next = Number((entry.target as HTMLElement).dataset.index);
          if (!Number.isInteger(next)) continue;
          setIndex(next);
          setConfirmingDelete(false);
        }
      },
      { root: track, threshold: [0.6] },
    );

    for (const panel of Array.from(track.children)) observer.observe(panel);
    return () => observer.disconnect();
  }, [photos.length]);

  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next >= photos.length) return;
      trackRef.current?.children[next]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    },
    [photos.length],
  );

  useEffect(() => {
    if (suspended) return;

    const onKey = (event: KeyboardEvent) => {
      // RTL: left is forward, the same direction the photos are laid out in.
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") goTo(index + 1);
      if (event.key === "ArrowRight") goTo(index - 1);
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [suspended, index, onClose, goTo]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // A photo added from inside the viewer lands at the front of the list and
  // shifts everything along, so staying put would silently show a different
  // photo. Move to the new one instead — it is what the upload was for.
  const previousCount = useRef(photos.length);
  useEffect(() => {
    if (photos.length > previousCount.current) {
      const added = photos.findIndex((photo) => photo.id !== HERO_PHOTO_ID);
      if (added !== -1) goTo(added);
    }
    previousCount.current = photos.length;
  }, [photos, goTo]);

  function promote() {
    if (!current) return;
    startTransition(async () => {
      await updateBoat(boatId, { photoPath: current.path });
      router.refresh();
    });
  }

  function remove() {
    if (!current) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    startTransition(async () => {
      await deleteMedia(current.id);
      setConfirmingDelete(false);
      router.refresh();
    });
  }

  if (!current) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="גלריית התמונות"
      className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-hull-950"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="סגירת הגלריה"
          className="rounded-full p-2.5 text-ink-muted transition hover:bg-hull-800 hover:text-ink"
        >
          <X className="size-5" aria-hidden />
        </button>

        <span className="numeric text-sm text-ink-muted">
          {safeIndex + 1} / {photos.length}
        </span>

        <button
          type="button"
          onClick={onAdd}
          aria-label="הוספת תמונה"
          className="rounded-full p-2.5 text-teal-400 transition hover:bg-teal-400/10"
        >
          <ImagePlus className="size-5" aria-hidden />
        </button>
      </header>

      <div
        ref={trackRef}
        className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto"
      >
        {photos.map((photo, position) => (
          <div
            key={photo.id}
            data-index={position}
            className="relative w-full shrink-0 snap-center"
          >
            <Image
              src={photo.url}
              alt={photo.caption ?? "תמונה של הסירה"}
              fill
              // Full width of the screen, and worth more than the default 75:
              // this view exists to show the photo properly.
              sizes="100vw"
              quality={90}
              // Only the photo the viewer opened on — a priority flag that
              // followed the swipe would rewrite fetch priorities mid-scroll.
              priority={photo.id === startId}
              className="object-contain"
            />
          </div>
        ))}
      </div>

      <footer className="flex shrink-0 flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {current.caption && (
          <p className="text-center text-sm text-ink-muted">{current.caption}</p>
        )}

        <div className="flex items-center justify-center gap-2">
          {current.isHero ? (
            <span className="flex items-center gap-1.5 rounded-full bg-teal-400/10 px-3.5 py-2 text-xs font-medium text-teal-400">
              <Star className="size-3.5 fill-current" aria-hidden />
              התמונה הראשית
            </span>
          ) : (
            <button
              type="button"
              onClick={promote}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-hull-800 px-3.5 py-2 text-xs font-medium text-ink transition hover:border-teal-400/30 disabled:opacity-50"
            >
              <Star className="size-3.5" aria-hidden />
              הפוך לתמונה ראשית
            </button>
          )}

          {/* The hero has no media row of its own, so there is nothing to
              delete — it is replaced from settings, or by promoting another. */}
          {current.id !== HERO_PHOTO_ID && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition disabled:opacity-50",
                confirmingDelete
                  ? "border-danger bg-danger/15 text-danger"
                  : "border-[var(--hairline)] bg-hull-800 text-ink-muted hover:text-ink",
              )}
            >
              <Trash2 className="size-3.5" aria-hidden />
              {confirmingDelete ? "להקיש שוב לאישור" : "מחיקה"}
            </button>
          )}
        </div>
      </footer>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/* Provider                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Owns the viewer and the upload sheet so the home screen can stay a Server
 * Component: the photos are signed and ordered on the server and handed down as
 * a prop, and everything under here is just open/closed state.
 *
 * The sheet is left mounted *over* the viewer rather than replacing it, so
 * adding a photo from inside the gallery returns you to the gallery — with the
 * new photo already in it, since the sheet refreshes the route on save.
 */
export function PhotoGallery({
  boatId,
  photos,
  openNew,
  children,
}: {
  boatId: string;
  photos: GalleryPhoto[];
  /** Arrived at `/?new=photo` from the home quick action. */
  openNew: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [startId, setStartId] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(openNew);
  // Only the sheet that the URL opened owes the URL a cleanup on close.
  const [fromUrl, setFromUrl] = useState(openNew);

  const openUpload = useCallback(() => setUploadOpen(true), []);

  const open = useCallback(
    (photoId?: string) => {
      // Nothing to look at yet — offer the thing they actually want instead.
      if (photos.length === 0) {
        setUploadOpen(true);
        return;
      }
      setStartId(photoId ?? photos[0].id);
      setViewerOpen(true);
    },
    [photos],
  );

  const closeViewer = useCallback(() => setViewerOpen(false), []);

  function closeUpload() {
    setUploadOpen(false);
    // Drop ?new=photo so a refresh does not reopen the sheet.
    if (fromUrl) {
      setFromUrl(false);
      router.replace("/", { scroll: false });
    }
  }

  return (
    <GalleryContext.Provider value={{ open, openUpload, count: photos.length }}>
      {children}

      {viewerOpen && (
        <Viewer
          boatId={boatId}
          photos={photos}
          startId={startId}
          onClose={closeViewer}
          onAdd={openUpload}
          suspended={uploadOpen}
        />
      )}

      <PhotoSheet boatId={boatId} open={uploadOpen} onClose={closeUpload} />
    </GalleryContext.Provider>
  );
}
