"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FolderClosed, Home, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/", label: "הבית", Icon: Home },
  { href: "/finances", label: "כספים", Icon: Wallet },
  { href: "/calendar", label: "יומן", Icon: CalendarDays },
  { href: "/documents", label: "מסמכים", Icon: FolderClosed },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--hairline)] bg-hull-850/95 backdrop-blur-lg"
    >
      <ul className="mx-auto flex max-w-lg items-stretch pb-[env(safe-area-inset-bottom)]">
        {ITEMS.map(({ href, label, Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-[var(--nav-height)] flex-col items-center justify-center gap-1 text-[11px] transition",
                  active ? "text-teal-400" : "text-ink-subtle hover:text-ink-muted",
                )}
              >
                <Icon
                  className={cn("size-5", active && "drop-shadow-[0_0_8px_rgba(46,211,198,0.5)]")}
                  aria-hidden
                />
                <span className={cn(active && "font-semibold")}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
