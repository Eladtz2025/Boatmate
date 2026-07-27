"use client";

import { cn } from "@/lib/cn";

/**
 * Small on/off switch for standing orders. Logical positioning only, so the
 * knob slides toward the start edge in RTL exactly as it should.
 */
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border transition disabled:opacity-50",
        checked
          ? "border-teal-400/40 bg-teal-400/80"
          : "border-[var(--hairline)] bg-hull-750",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4.5 rounded-full bg-ink transition-all",
          checked ? "end-0.5" : "end-[1.375rem]",
        )}
      />
    </button>
  );
}
