import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The app's one surface primitive. In RTL the "forward" chevron points left,
 * which is why the affordance below is ChevronLeft rather than ChevronRight.
 */
export function Card({
  className,
  children,
  as: As = "div",
}: {
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "article" | "li";
}) {
  return <As className={cn("card p-4", className)}>{children}</As>;
}

export function CardTitle({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-sm font-medium text-ink-muted">{children}</h2>
      {action}
    </div>
  );
}

export function CardLinkAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-0.5 text-xs font-medium text-teal-400 transition hover:text-teal-500"
    >
      {children}
      <ChevronLeft className="size-3.5" aria-hidden />
    </Link>
  );
}

/** A tappable card that navigates. */
export function CardLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "card block p-4 transition active:scale-[0.99] hover:border-teal-400/30",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Small label above a value inside a tile. */
export function TileLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium text-ink-muted">{children}</p>;
}
