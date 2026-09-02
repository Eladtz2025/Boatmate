import { Moon, Sun, Sunrise, type LucideIcon } from "lucide-react";
import {
  SEGMENT_LABEL,
  segmentsLabel,
  sortSegments,
  type Segment,
} from "@/lib/attendance";
import { cn } from "@/lib/cn";

/**
 * One glyph per chosen part of the day, in day order.
 *
 * Defined once and rendered by all three places attendance shows up — the day
 * card in the strip, the list under it, and the home tile — so a sunrise means
 * the same thing everywhere. Deliberately not a client component: none of it
 * is interactive, and the home screen renders it on the server.
 */

const ICON: Record<Segment, LucideIcon> = {
  morning: Sunrise,
  noon: Sun,
  night: Moon,
};

/** Warm for the daylight halves, cool for the night — readable at 10px. */
const TONE: Record<Segment, string> = {
  morning: "text-warning",
  noon: "text-warning",
  night: "text-ink-muted",
};

export function SegmentMarks({
  segments,
  className,
  iconClassName = "size-3",
}: {
  segments: readonly Segment[];
  className?: string;
  iconClassName?: string;
}) {
  const chosen = sortSegments(segments);
  if (chosen.length === 0) return null;

  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      // The icons are the compact form; the words are what a screen reader and
      // a long-press both get.
      title={segmentsLabel(chosen)}
      aria-label={segmentsLabel(chosen)}
    >
      {chosen.map((key) => {
        const Icon = ICON[key];
        return (
          <Icon
            key={key}
            className={cn("shrink-0", iconClassName, TONE[key])}
            aria-hidden
          />
        );
      })}
    </span>
  );
}

/** The same glyph on its own — used beside a single option in the picker. */
export function SegmentIcon({
  segment,
  className,
}: {
  segment: Segment;
  className?: string;
}) {
  const Icon = ICON[segment];
  return <Icon className={className} aria-label={SEGMENT_LABEL[segment]} />;
}
