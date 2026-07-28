"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type DayTab = {
  /** "היום" / "מחר" / "יום ג׳" */
  label: string;
  /** "29.7" */
  sub: string;
  tone: "good" | "caution" | "poor";
};

const TONE_DOT = {
  good: "bg-teal-400",
  caution: "bg-warning",
  poor: "bg-danger",
} as const;

/**
 * The day pager for the sailing card.
 *
 * Presentation only: every panel is rendered on the server and handed in as
 * children, so paging through the week costs no fetch and the card keeps the
 * property that made it a Server Component in the first place — it paints from
 * cache with no skeleton and no second chance to get the clock wrong.
 *
 * Paging is native scroll-snap, which is what gives it a real swipe on a phone
 * for free. Two consequences worth knowing:
 *
 * - The active panel is read back with an IntersectionObserver rather than from
 *   scrollLeft. Under `dir="rtl"` scrollLeft counts *down* from zero, and the
 *   sign differs between browsers; intersection is direction-agnostic.
 * - Tapping a tab moves with `scrollIntoView`, for the same reason. `inline`
 *   resolves against the writing direction, so it needs no RTL special case.
 */
export function ConditionsCarousel({
  tabs,
  children,
}: {
  tabs: DayTab[];
  children: ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const panels = Children.toArray(children);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // Panels are exactly one track wide, so at rest one sits at 1 and the
          // rest at 0. Anything past 0.6 is unambiguously the one on screen.
          if (entry.intersectionRatio < 0.6) continue;
          const index = Number((entry.target as HTMLElement).dataset.index);
          if (Number.isInteger(index)) setActive(index);
        }
      },
      { root: track, threshold: [0.6] },
    );

    for (const panel of Array.from(track.children)) observer.observe(panel);
    return () => observer.disconnect();
  }, [panels.length]);

  // Keep the selected tab in view when the day was changed by swiping — the
  // row scrolls on narrow screens. A no-op when the tab is already visible.
  useEffect(() => {
    tabsRef.current?.children[active]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [active]);

  function goTo(index: number) {
    trackRef.current?.children[index]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }

  return (
    <>
      <div
        ref={tabsRef}
        role="tablist"
        aria-label="ימי התחזית"
        className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl border border-[var(--hairline)] bg-hull-850 p-1"
      >
        {tabs.map((tab, index) => {
          const selected = index === active;
          return (
            <button
              key={tab.label + tab.sub}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => goTo(index)}
              className={cn(
                "flex flex-1 shrink-0 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 transition",
                selected
                  ? "bg-teal-400 text-hull-950"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              <span
                className={cn(
                  "whitespace-nowrap text-xs leading-tight",
                  selected && "font-semibold",
                )}
              >
                {tab.label}
              </span>
              <span className="flex items-center gap-1">
                <span className="numeric text-[10px] leading-none opacity-70">
                  {tab.sub}
                </span>
                {/* The verdict at a glance. Dropped on the selected tab, where
                    it would sit teal-on-teal and the panel spells it out anyway. */}
                {!selected && (
                  <span
                    className={cn("size-1.5 rounded-full", TONE_DOT[tab.tone])}
                    aria-hidden
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div
        ref={trackRef}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory overflow-x-auto scroll-smooth"
      >
        {panels.map((panel, index) => (
          <div
            key={index}
            data-index={index}
            role="tabpanel"
            aria-label={tabs[index]?.label}
            className="w-full shrink-0 snap-start px-4"
          >
            {panel}
          </div>
        ))}
      </div>
    </>
  );
}
