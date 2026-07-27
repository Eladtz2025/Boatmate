"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, ErrorNote } from "@/components/ui/empty-state";
import { deleteTransfer } from "@/app/actions";
import { suggestSettlements } from "@/lib/balance";
import { formatAgorot, formatAgorotAbs, formatShortDate } from "@/lib/format";
import { TransferSheet, type TransferPrefill } from "./transfer-sheet";
import { memberIndex, type FinanceBalance, type FinanceMember, type FinanceTransfer } from "./types";

export function TransfersTab({
  boatId,
  members,
  balances,
  transfers,
}: {
  boatId: string;
  members: FinanceMember[];
  balances: FinanceBalance[];
  transfers: FinanceTransfer[];
}) {
  const router = useRouter();
  const byId = useMemo(() => memberIndex(members), [members]);
  const settlements = useMemo(() => suggestSettlements(balances), [balances]);

  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<TransferPrefill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const nameOf = (userId: string) => byId[userId]?.name ?? "שותף";

  function openSheet(next: TransferPrefill | null) {
    setPrefill(next);
    setOpen(true);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    const result = await deleteTransfer(id);
    setDeletingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Suggested settlements --------------------------------------- */}
      <Card>
        <CardTitle>הצעות להסדרה</CardTitle>

        {settlements.length === 0 ? (
          <p className="py-2 text-xs text-ink-subtle">כולם מאוזנים — אין מה להסדיר.</p>
        ) : (
          <ul className="space-y-2">
            {settlements.map((settlement) => (
              <li
                key={`${settlement.fromUser}-${settlement.toUser}`}
                className="flex items-center gap-2 rounded-tile bg-hull-750/60 px-3 py-2"
              >
                <Avatar
                  name={nameOf(settlement.fromUser)}
                  color={byId[settlement.fromUser]?.color}
                  size="xs"
                />
                <span className="truncate text-sm">{nameOf(settlement.fromUser)}</span>
                <ArrowLeft className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                <Avatar
                  name={nameOf(settlement.toUser)}
                  color={byId[settlement.toUser]?.color}
                  size="xs"
                />
                <span className="truncate text-sm">{nameOf(settlement.toUser)}</span>

                <span className="numeric ms-auto shrink-0 text-sm font-semibold text-teal-400">
                  {formatAgorotAbs(settlement.amountAgorot)}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  onClick={() =>
                    openSheet({
                      fromUser: settlement.fromUser,
                      toUser: settlement.toUser,
                      amountAgorot: settlement.amountAgorot,
                    })
                  }
                >
                  רשום העברה
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Per-partner balances ---------------------------------------- */}
      <Card>
        <CardTitle>יתרות לפי שותף</CardTitle>
        <ul className="space-y-2">
          {balances.map((balance) => {
            const member = byId[balance.userId];
            const label =
              balance.balanceAgorot > 0
                ? "מגיע לו"
                : balance.balanceAgorot < 0
                  ? "חייב"
                  : "מאוזן";
            const tone =
              balance.balanceAgorot > 0
                ? "text-success"
                : balance.balanceAgorot < 0
                  ? "text-danger"
                  : "text-ink-muted";

            return (
              <li key={balance.userId} className="flex items-center gap-3">
                <Avatar name={member?.name ?? "שותף"} color={member?.color} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {member?.name ?? "שותף"}
                </span>
                <span className="text-xs text-ink-subtle">{label}</span>
                <span className={`numeric text-sm font-semibold ${tone}`}>
                  {formatAgorotAbs(balance.balanceAgorot)}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* History ------------------------------------------------------ */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-ink-muted">היסטוריית העברות</h3>
          <Button
            size="sm"
            icon={<Plus className="size-4" aria-hidden />}
            onClick={() => openSheet(null)}
          >
            העברה חדשה
          </Button>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        {transfers.length === 0 ? (
          <EmptyState
            icon={<ArrowLeftRight className="size-7" aria-hidden />}
            title="אין עדיין העברות"
            description="אחרי שתעבירו כסף בין השותפים, רשמו את זה כאן כדי שהיתרות יתעדכנו."
          />
        ) : (
          <ul className="card divide-y divide-[var(--hairline)] overflow-hidden p-0">
            {transfers.map((transfer) => (
              <li key={transfer.id} className="flex items-center gap-3 px-3 py-3">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-tile bg-hull-750 text-teal-400">
                  <ArrowLeftRight className="size-4" aria-hidden />
                </span>

                <div className="min-w-0 flex-1">
                  {/* An "←" text character is bidi-mirrored inside RTL copy and
                      would render pointing back at the sender. The icon is not. */}
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{nameOf(transfer.fromUser)}</span>
                    <ArrowLeft className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                    <span className="truncate">{nameOf(transfer.toUser)}</span>
                  </p>
                  <p className="truncate text-xs text-ink-subtle">
                    <span className="numeric">{formatShortDate(transfer.transferredOn)}</span>
                    {transfer.note ? ` · ${transfer.note}` : ""}
                  </p>
                </div>

                <span className="numeric shrink-0 text-sm font-semibold">
                  {formatAgorot(transfer.amountAgorot)}
                </span>

                <button
                  type="button"
                  aria-label="מחיקת העברה"
                  disabled={deletingId === transfer.id}
                  onClick={() => void handleDelete(transfer.id)}
                  className="shrink-0 rounded-full p-2 text-ink-subtle transition hover:bg-hull-750 hover:text-danger disabled:opacity-50"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {open && (
        <TransferSheet
          onClose={() => setOpen(false)}
          boatId={boatId}
          members={members}
          prefill={prefill}
        />
      )}
    </div>
  );
}
