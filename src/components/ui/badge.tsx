import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { ExpiryState } from "@/lib/format";

type Tone = "neutral" | "teal" | "warning" | "danger" | "success";

const TONES: Record<Tone, string> = {
  neutral: "bg-hull-750 text-ink-muted",
  teal: "bg-teal-400/15 text-teal-400",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  success: "bg-success/15 text-success",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const EXPIRY_TONE: Record<ExpiryState, Tone> = {
  valid: "teal",
  soon: "warning",
  expired: "danger",
};

export function ExpiryBadge({
  state,
  label,
}: {
  state: ExpiryState;
  label: string;
}) {
  return <Badge tone={EXPIRY_TONE[state]}>{label}</Badge>;
}
