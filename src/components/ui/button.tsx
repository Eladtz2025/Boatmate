"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-teal-400 text-hull-950 font-semibold hover:bg-teal-500 active:bg-teal-600 disabled:bg-teal-400/40",
  secondary:
    "bg-hull-750 text-ink hover:bg-hull-700 border border-[var(--hairline)]",
  ghost: "text-ink-muted hover:text-ink hover:bg-hull-750",
  danger: "bg-danger/15 text-danger hover:bg-danger/25 border border-danger/30",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-xl gap-1.5",
  md: "h-11 px-4 text-sm rounded-2xl gap-2",
  lg: "h-13 px-5 text-base rounded-2xl gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  block = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center transition select-none",
        "disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
