import Image from "next/image";

/**
 * The hero photo. Falls back to the generated dusk placeholder until the crew
 * uploads a real photo of the boat (boats.photo_path → signed URL).
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
    // rounded-card, not rounded-[--radius-card]: the bracket form is Tailwind
    // v3 syntax that v4 no longer compiles, so the frame was rendering with
    // square corners against rounded cards everywhere else. --radius-card lives
    // in @theme, so v4 generates the utility from the token itself.
    <div className="relative mx-4 aspect-[4/3] overflow-hidden rounded-card border border-[var(--hairline)]">
      <Image
        src={photoUrl ?? "/images/boat-hero.jpg"}
        alt={`תמונה של ${boatName}`}
        fill
        priority
        sizes="(max-width: 512px) 100vw, 512px"
        className="object-cover"
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
