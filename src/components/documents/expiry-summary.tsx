"use client";

import { ChevronLeft, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Alert strip above the list: how many documents are expired or inside their
 * reminder window. Tapping it filters the list down to exactly those.
 */
export function ExpirySummary({
  expiredCount,
  soonCount,
  active,
  onToggle,
}: {
  expiredCount: number;
  soonCount: number;
  active: boolean;
  onToggle: () => void;
}) {
  if (expiredCount === 0 && soonCount === 0) return null;

  const critical = expiredCount > 0;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "card flex w-full items-center gap-3 p-3 text-start transition",
        critical ? "border-danger/30 bg-danger/10" : "border-warning/30 bg-warning/10",
        active && "ring-1 ring-teal-400/50",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-tile",
          critical ? "bg-danger/15 text-danger" : "bg-warning/15 text-warning",
        )}
      >
        <TriangleAlert className="size-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">
          {critical ? "מסמכים שפג תוקפם" : "תפוגה קרובה"}
        </span>
        <span className="mt-0.5 block text-xs text-ink-muted">
          {expiredCount > 0 && (
            <>
              <span className="numeric">{expiredCount}</span> פג תוקף
            </>
          )}
          {expiredCount > 0 && soonCount > 0 && <span aria-hidden> · </span>}
          {soonCount > 0 && (
            <>
              <span className="numeric">{soonCount}</span> מתקרבים לתפוגה
            </>
          )}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-teal-400">
        {active ? "הצגת הכל" : "הצגה"}
        <ChevronLeft className="size-3.5" aria-hidden />
      </span>
    </button>
  );
}
