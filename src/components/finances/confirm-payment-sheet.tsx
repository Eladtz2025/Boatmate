"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui/sheet";
import { DateInput, MoneyInput } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/empty-state";
import { confirmRecurringPayment } from "@/app/actions";
import { agorotToShekelInput, formatShortDate, parseShekelInput, toDateInput } from "@/lib/format";
import { expenseCategoryLabel } from "@/lib/constants";
import { MemberChips } from "./member-chips";
import { ReceiptPicker } from "./receipt-picker";
import { SplitEditor } from "./split-editor";
import { buildSharePlan, emptySplitState, splitDelta, type SplitState } from "./split";
import type { FinanceMember, FinanceOccurrence } from "./types";

/**
 * Confirming an occurrence is the moment a standing order turns into a real
 * expense — this is the only place a pending payment starts affecting balances.
 */
export function ConfirmPaymentSheet({
  occurrence,
  onClose,
  boatId,
  members,
  currentUserId,
}: {
  occurrence: FinanceOccurrence;
  onClose: () => void;
  boatId: string;
  members: FinanceMember[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const memberIds = useMemo(() => members.map((m) => m.userId), [members]);

  const [paidBy, setPaidBy] = useState<string | null>(
    () => occurrence.defaultPaidBy ?? currentUserId ?? members[0]?.userId ?? null,
  );
  const [amountText, setAmountText] = useState(() =>
    agorotToShekelInput(occurrence.amountAgorot),
  );
  const [paidOn, setPaidOn] = useState(() => toDateInput());
  const [splitState, setSplitState] = useState<SplitState>(() => emptySplitState());
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountAgorot = parseShekelInput(amountText) ?? 0;
  const delta = splitDelta(amountAgorot, memberIds, splitState);
  const canConfirm = !busy && amountAgorot > 0 && !!paidBy && delta === 0;

  async function handleConfirm() {
    if (!paidBy) return;

    setBusy(true);
    setError(null);

    const result = await confirmRecurringPayment({
      occurrenceId: occurrence.id,
      paidBy,
      amountAgorot,
      paidOn,
      plan: buildSharePlan(amountAgorot, memberIds, splitState),
      receiptPath,
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="אישור תשלום"
      onConfirm={() => void handleConfirm()}
      confirmDisabled={!canConfirm}
      busy={busy}
      confirmLabel="אישור התשלום"
    >
      <div className="space-y-4">
        <div className="card p-3">
          <p className="text-sm font-semibold">{occurrence.title}</p>
          <p className="text-xs text-ink-subtle">
            {expenseCategoryLabel(occurrence.category)} · מועד חיוב{" "}
            <span className="numeric">{formatShortDate(occurrence.dueOn)}</span>
          </p>
        </div>

        <MemberChips
          label="שולם על ידי"
          members={members}
          value={paidBy}
          onChange={setPaidBy}
        />

        <MoneyInput
          label="סכום"
          hint="אפשר לעדכן אם החיוב בפועל היה שונה"
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
        />

        <DateInput
          label="תאריך תשלום"
          value={paidOn}
          onChange={(event) => setPaidOn(event.target.value)}
        />

        <SplitEditor
          members={members}
          amountAgorot={amountAgorot}
          state={splitState}
          onChange={setSplitState}
        />

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-ink-muted">קבלה (אופציונלי)</p>
          <ReceiptPicker boatId={boatId} path={receiptPath} onChange={setReceiptPath} />
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Sheet>
  );
}
