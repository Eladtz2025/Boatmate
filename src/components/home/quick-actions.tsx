"use client";

import Link from "next/link";
import { CalendarPlus, Camera, FilePlus2, ReceiptText } from "lucide-react";

/**
 * The four shortcuts from the mockup. Each deep-links into the owning screen
 * with the relevant sheet already open, so adding an expense is two taps from
 * a cold start.
 */
const ACTIONS = [
  { href: "/finances?new=expense", label: "הוצאה חדשה", Icon: ReceiptText },
  { href: "/documents?new=document", label: "העלאת מסמך", Icon: FilePlus2 },
  { href: "/calendar?new=event", label: "הוספת אירוע", Icon: CalendarPlus },
  { href: "/?new=photo", label: "העלאת תמונה", Icon: Camera },
] as const;

export function QuickActions() {
  return (
    <nav aria-label="פעולות מהירות" className="grid grid-cols-4 gap-2">
      {ACTIONS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className="card flex flex-col items-center gap-1.5 px-1 py-3 text-center transition active:scale-[0.97] hover:border-teal-400/30"
        >
          <Icon className="size-5 text-teal-400" aria-hidden />
          <span className="text-[11px] leading-tight text-ink-muted">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
