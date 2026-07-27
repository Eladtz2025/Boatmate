"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Horizontally scrolling filter row (documents categories, log kinds…). */
export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1">
      {children}
    </div>
  );
}

export function Chip({
  active = false,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full px-3.5 py-1.5 text-sm transition",
        active
          ? "bg-teal-400 font-semibold text-hull-950"
          : "bg-hull-800 text-ink-muted hover:text-ink border border-[var(--hairline)]",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Segmented control used for the finance and calendar sub-views.
 * Options render right-to-left naturally; the active pill is teal.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "no-scrollbar flex gap-1 overflow-x-auto rounded-2xl border border-[var(--hairline)] bg-hull-850 p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition",
              active
                ? "bg-teal-400 font-semibold text-hull-950"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
