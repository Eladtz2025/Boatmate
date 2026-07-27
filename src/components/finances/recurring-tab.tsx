"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Info, Plus, Repeat, SkipForward } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorNote } from "@/components/ui/empty-state";
import { setRecurringActive, skipRecurringOccurrence } from "@/app/actions";
import { cadenceLabel, expenseCategoryLabel } from "@/lib/constants";
import { formatAgorot, formatRelativeDays, formatShortDate } from "@/lib/format";
import { CategoryTile } from "./category-icon";
import { ConfirmPaymentSheet } from "./confirm-payment-sheet";
import { RecurringSheet } from "./recurring-sheet";
import { Toggle } from "./toggle";
import type { FinanceMember, FinanceOccurrence, FinanceRecurring } from "./types";

export function RecurringTab({
  boatId,
  members,
  recurring,
  upcoming,
  currentUserId,
}: {
  boatId: string;
  members: FinanceMember[];
  recurring: FinanceRecurring[];
  upcoming: FinanceOccurrence[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirming, setConfirming] = useState<FinanceOccurrence | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingTotal = useMemo(
    () => upcoming.reduce((sum, item) => sum + item.amountAgorot, 0),
    [upcoming],
  );

  function toggleActive(id: string, active: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setRecurringActive(id, active);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function skip(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await skipRecurringOccurrence(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-ink-muted">הוראות קבע</h3>
        <Button
          size="sm"
          icon={<Plus className="size-4" aria-hidden />}
          onClick={() => setSheetOpen(true)}
        >
          הוראת קבע חדשה
        </Button>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {recurring.length === 0 ? (
        <EmptyState
          icon={<Repeat className="size-7" aria-hidden />}
          title="אין עדיין הוראות קבע"
          description="שכירות, מרינה, ביטוח — כל תשלום חוזר יופיע כאן וימתין לאישור בכל מועד חיוב."
          action={
            <Button size="sm" onClick={() => setSheetOpen(true)}>
              הוספת הוראת קבע
            </Button>
          }
        />
      ) : (
        <ul className="card divide-y divide-[var(--hairline)] overflow-hidden p-0">
          {recurring.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-3">
              <CategoryTile category={item.category} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="truncate text-xs text-ink-subtle">
                  {expenseCategoryLabel(item.category)} · {cadenceLabel(item.cadence)} · יום{" "}
                  <span className="numeric">{item.dayOfMonth}</span>
                </p>
              </div>

              <span className="numeric shrink-0 text-sm font-semibold">
                {formatAgorot(item.amountAgorot)}
              </span>

              <Toggle
                checked={item.active}
                disabled={pending}
                label={`הפעלת ${item.title}`}
                onChange={(next) => toggleActive(item.id, next)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Pending occurrences ----------------------------------------- */}
      <Card>
        <CardTitle
          action={
            upcoming.length > 0 ? (
              <span className="numeric text-xs text-ink-subtle">
                {formatAgorot(pendingTotal)}
              </span>
            ) : undefined
          }
        >
          תשלומים ממתינים לאישור
        </CardTitle>

        <p className="mb-3 flex items-start gap-1.5 text-xs text-ink-subtle">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          תשלומים ממתינים אינם משפיעים על היתרות. רק אישור תשלום הופך אותו להוצאה אמיתית.
        </p>

        {upcoming.length === 0 ? (
          <p className="py-2 text-xs text-ink-subtle">אין תשלומים שממתינים לאישור.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((item) => (
              <li key={item.id} className="rounded-tile bg-hull-750/60 p-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-hull-800 text-teal-400">
                    <CalendarClock className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-ink-subtle">
                      <span className="numeric">{formatShortDate(item.dueOn)}</span> ·{" "}
                      {formatRelativeDays(item.dueOn)}
                    </p>
                  </div>
                  <span className="numeric shrink-0 text-sm font-semibold">
                    {formatAgorot(item.amountAgorot)}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  <Button size="sm" onClick={() => setConfirming(item)}>
                    אשר תשלום
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<SkipForward className="size-4" aria-hidden />}
                    disabled={pending}
                    onClick={() => skip(item.id)}
                  >
                    דלג
                  </Button>
                  <Badge className="ms-auto" tone="neutral">
                    ממתין
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {sheetOpen && (
        <RecurringSheet
          onClose={() => setSheetOpen(false)}
          boatId={boatId}
          members={members}
          currentUserId={currentUserId}
        />
      )}

      {confirming && (
        <ConfirmPaymentSheet
          occurrence={confirming}
          onClose={() => setConfirming(null)}
          boatId={boatId}
          members={members}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}
