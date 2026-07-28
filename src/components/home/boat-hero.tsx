import Image from "next/image";

/**
 * The hero photo. Falls back to the generated dusk placeholder until the crew
 * uploads a real photo of the boat (boats.photo_path → signed URL).
 *
 * 16/9 rather than 4/3, and anchored to the bottom of the source image. Two
 * reasons, both from looking at it on an actual phone:
 *
 * - 4/3 made the frame ~285px tall on a 412px-wide screen, which pushed the
 *   conditions card under the bottom nav. The wider ratio gives back ~70px and
 *   lets the photo and the card sit together above the nav.
 * - object-cover crops the overflow, and centring it threw away the waterline
 *   while keeping the skyline. The boats are the subject, so object-bottom
 *   keeps the hulls and drops the buildings instead.
 */
export function BoatHero({
  photoUrl,
  statusText,
  boatName,
}: {
  photoUrl: string | null;
  statusText: string | null;
  boatName: string;
}) {
  return (
    <div className="relative mx-4 aspect-[16/9] overflow-hidden rounded-card border border-[var(--hairline)]">
      <Image
        src={photoUrl ?? "/images/boat-hero.jpg"}
        alt={`תמונה של ${boatName}`}
        fill
        priority
        sizes="(max-width: 512px) 100vw, 512px"
        className="object-cover object-bottom"
      />

      <div className="absolute inset-0 bg-gradient-to-t from-hull-950/80 via-transparent to-transparent" />

      {statusText && (
        <p className="absolute bottom-3 start-4 end-4 text-sm font-medium text-ink drop-shadow">
          {statusText}
        </p>
      )}
    </div>
  );
}
