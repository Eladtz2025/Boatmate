"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock, MapPin, Share2, Trash2 } from "lucide-react";
import type { CalendarItem } from "@/lib/data";
import { deleteEvent } from "@/app/actions";
import { CALENDAR_KIND_LABEL } from "@/lib/constants";
import { cn } from "@/lib/cn";
import {
  formatDateRange,
  formatLongDate,
  formatRelativeDays,
  formatTime,
} from "@/lib/format";
import { eventMessage, share } from "@/lib/whatsapp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { kindMeta } from "./kind-meta";

function DetailLine({
  icon,
  children,
  numeric = false,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-ink-muted">
      <span className="text-ink-subtle">{icon}</span>
      <span className={cn("min-w-0 flex-1 text-ink", numeric && "numeric")}>{children}</span>
    </div>
  );
}

/** Details for a real event — usage, arrival, maintenance or other. */
export function EventSheet({
  item,
  boatName,
  onClose,
}: {
  item: CalendarItem | null;
  boatName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!item) return null;

  const meta = kindMeta(item.kind);
  const kindLabel = CALENDAR_KIND_LABEL[item.kind] ?? CALENDAR_KIND_LABEL.other;

  const onShare = () => {
    void share(
      eventMessage(boatName, {
        title: item.title,
        startsAt: item.startsAt,
        location: item.location,
      }),
    );
  };

  const onDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteEvent(item.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <Sheet open onClose={onClose} title={kindLabel}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-tile",
              meta.tile,
              meta.text,
            )}
          >
            <meta.Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-ink">{item.title}</h3>
            <Badge className="mt-1">{kindLabel}</Badge>
          </div>
        </div>

        <div className="space-y-2.5 rounded-2xl border border-[var(--hairline)] bg-hull-800 p-3.5">
          {/* Only the digit-only range is LTR-isolated; formatLongDate is a
              Hebrew sentence and `.numeric` would reorder its words. */}
          <DetailLine
            icon={<CalendarDays className="size-4" aria-hidden />}
            numeric={item.kind === "arrival" && Boolean(item.endsAt)}
          >
            {item.kind === "arrival" && item.endsAt
              ? formatDateRange(item.startsAt, item.endsAt)
              : formatLongDate(item.startsAt)}
          </DetailLine>

          <DetailLine
            icon={<Clock className="size-4" aria-hidden />}
            numeric={!item.allDay}
          >
            {item.allDay
              ? "כל היום"
              : item.endsAt
                ? `${formatTime(item.startsAt)} - ${formatTime(item.endsAt)}`
                : formatTime(item.startsAt)}
          </DetailLine>

          {item.location && (
            <DetailLine icon={<MapPin className="size-4" aria-hidden />}>
              {item.location}
            </DetailLine>
          )}

          <p className="text-xs text-ink-subtle">{formatRelativeDays(item.startsAt)}</p>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>

      <div className="mt-5 flex gap-2">
        <Button
          variant="secondary"
          block
          onClick={onShare}
          icon={<Share2 className="size-4" aria-hidden />}
        >
          שיתוף
        </Button>
        <Button
          variant="danger"
          block
          loading={pending}
          onClick={onDelete}
          icon={<Trash2 className="size-4" aria-hidden />}
        >
          מחיקה
        </Button>
      </div>
    </Sheet>
  );
}
