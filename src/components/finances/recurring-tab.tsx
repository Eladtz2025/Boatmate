"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowLeftRight,
  CalendarClock,
  Info,
  Plus,
  Repeat,
  SkipForward,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorNote } from "@/components/ui/empty-state";
import { setRecurringActive, skipRecurringOccurrence } from "@/app/actions";
import { cadenceLabel, expenseCategoryLabel, recurringKindLabel } from "@/lib/constants";
import { formatAgorot, formatRelativeDays, formatShortDate } from "@/lib/format";
import { CategoryTile } from "./category-icon";
import { ConfirmPaymentSheet } from "./confirm-payment-sheet";
import { ConfirmTransferSheet } from "./confirm-transfer-sheet";
import { RecurringSheet } from "./recurring-sheet";
import { Toggle } from "./toggle";
import {
  memberNameMap,
  type FinanceMember,
  type FinanceOccurrence,
  type FinanceRecurring,
} from "./types";

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

  const names = useMemo(() => memberNameMap(members), [members]);

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
          {recurring.map((item) => {
            const isTransfer = item.kind === "transfer";
            return (
            <li key={item.id} className="flex items-center gap-3 px-3 py-3">
              {/* A direct transfer has no category to picture — it gets the
                  two-way arrow the transfers tab already uses. */}
              {isTransfer ? (
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-tile bg-hull-750 text-teal-400">
                  <ArrowLeftRight className="size-4" aria-hidden />
                </span>
              ) : (
                <CategoryTile category={item.category} />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  {isTransfer && (
                    <Badge tone="neutral">{recurringKindLabel(item.kind)}</Badge>
                  )}
                </div>
                {isTransfer ? (
                  <p className="flex min-w-0 items-center gap-1 text-xs text-ink-subtle">
                    <span className="truncate">{names[item.fromUser ?? ""] ?? "שותף"}</span>
                    <ArrowLeft className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">{names[item.toUser ?? ""] ?? "שותף"}</span>
                    <span aria-hidden>·</span>
                    <span className="shrink-0">{cadenceLabel(item.cadence)}</span>
                  </p>
                ) : (
                  <p className="truncate text-xs text-ink-subtle">
                    {expenseCategoryLabel(item.category)} · {cadenceLabel(item.cadence)} · יום{" "}
                    <span className="numeric">{item.dayOfMonth}</span>
                  </p>
                )}
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
            );
          })}
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
          תשלומים ממתינים אינם משפיעים על היתרות. רק אישור הופך אותם להוצאה או להעברה
          אמיתית.
        </p>

        {upcoming.length === 0 ? (
          <p className="py-2 text-xs text-ink-subtle">אין תשלומים שממתינים לאישור.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((item) => {
              const isTransfer = item.kind === "transfer";
              return (
              <li key={item.id} className="rounded-tile bg-hull-750/60 p-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-hull-800 text-teal-400">
                    {isTransfer ? (
                      <ArrowLeftRight className="size-4" aria-hidden />
                    ) : (
                      <CalendarClock className="size-4" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="flex min-w-0 items-center gap-1 text-xs text-ink-subtle">
                      <span className="numeric">{formatShortDate(item.dueOn)}</span>
                      <span aria-hidden>·</span>
                      <span className="shrink-0">{formatRelativeDays(item.dueOn)}</span>
                      {isTransfer && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="truncate">
                            {names[item.fromUser ?? ""] ?? "שותף"}
                          </span>
                          <ArrowLeft className="size-3 shrink-0" aria-hidden />
                          <span className="truncate">
                            {names[item.toUser ?? ""] ?? "שותף"}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <span className="numeric shrink-0 text-sm font-semibold">
                    {formatAgorot(item.amountAgorot)}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  <Button size="sm" onClick={() => setConfirming(item)}>
                    {isTransfer ? "אשר העברה" : "אשר תשלום"}
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
                    {isTransfer ? "העברה ממתינה" : "ממתין"}
                  </Badge>
                </div>
              </li>
              );
            })}
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

      {/* Two confirm paths, chosen by the standing order's kind: one writes an
          expense with shares, the other writes a transfer and nothing else. */}
      {confirming &&
        (confirming.kind === "transfer" ? (
          <ConfirmTransferSheet
            occurrence={confirming}
            onClose={() => setConfirming(null)}
            members={members}
          />
        ) : (
          <ConfirmPaymentSheet
            occurrence={confirming}
            onClose={() => setConfirming(null)}
            boatId={boatId}
            members={members}
            currentUserId={currentUserId}
          />
        ))}
    </div>
  );
}
