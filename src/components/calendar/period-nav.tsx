"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Header for the month / week / day views.
 *
 * RTL: the first child sits on the RIGHT, so "previous" is the right-pointing
 * chevron and "next" is the left-pointing one — the reading direction.
 */
export function PeriodNav({
  title,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
}: {
  title: ReactNode;
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onPrev}
        aria-label={prevLabel}
        className="flex size-11 items-center justify-center rounded-full text-ink-muted transition hover:bg-hull-750 hover:text-ink"
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>

      <h2 className="text-base font-semibold text-ink">{title}</h2>

      <button
        type="button"
        onClick={onNext}
        aria-label={nextLabel}
        className="flex size-11 items-center justify-center rounded-full text-ink-muted transition hover:bg-hull-750 hover:text-ink"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
    </div>
  );
}
