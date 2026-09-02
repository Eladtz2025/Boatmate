"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { DateInput, MoneyInput, TextArea } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/empty-state";
import { confirmRecurringTransfer } from "@/app/actions";
import { agorotToShekelInput, formatShortDate, parseShekelInput, toDateInput } from "@/lib/format";
import { memberNameMap, type FinanceMember, type FinanceOccurrence } from "./types";

/**
 * Confirming a direct standing order records a settlement between two partners
 * and nothing else — no expense, no shares, no split editor to get wrong.
 *
 * The two parties are read-only here on purpose: they belong to the standing
 * order, and letting this sheet redirect one payment would leave the list
 * saying something the transfer does not.
 */
export function ConfirmTransferSheet({
  occurrence,
  onClose,
  members,
}: {
  occurrence: FinanceOccurrence;
  onClose: () => void;
  members: FinanceMember[];
}) {
  const router = useRouter();
  const names = memberNameMap(members);

  const [amountText, setAmountText] = useState(() =>
    agorotToShekelInput(occurrence.amountAgorot),
  );
  const [paidOn, setPaidOn] = useState(() => toDateInput());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountAgorot = parseShekelInput(amountText) ?? 0;
  const canConfirm = !busy && amountAgorot > 0;

  async function handleConfirm() {
    setBusy(true);
    setError(null);

    const result = await confirmRecurringTransfer({
      occurrenceId: occurrence.id,
      amountAgorot,
      paidOn,
      note: note.trim() || null,
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
      title="אישור העברה"
      onConfirm={() => void handleConfirm()}
      confirmDisabled={!canConfirm}
      busy={busy}
      confirmLabel="אישור ההעברה"
    >
      <div className="space-y-4">
        <div className="card p-3">
          <p className="text-sm font-semibold">{occurrence.title}</p>
          <p className="text-xs text-ink-subtle">
            ישירות לשותף · מועד חיוב{" "}
            <span className="numeric">{formatShortDate(occurrence.dueOn)}</span>
          </p>

          <p className="mt-2 flex items-center gap-1.5 text-sm">
            <span>{names[occurrence.fromUser ?? ""] ?? "שותף"}</span>
            {/* Forward is left: that is the reading direction here. */}
            <ArrowLeft className="size-4 shrink-0 text-teal-400" aria-hidden />
            <span>{names[occurrence.toUser ?? ""] ?? "שותף"}</span>
          </p>
        </div>

        <MoneyInput
          label="סכום"
          hint="אפשר לעדכן אם ההעברה בפועל הייתה שונה"
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
        />

        <DateInput
          label="תאריך ההעברה"
          value={paidOn}
          onChange={(event) => setPaidOn(event.target.value)}
        />

        <TextArea
          label="הערה (אופציונלי)"
          placeholder="למשל: הועבר בביט"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        <p className="text-xs text-ink-subtle">
          ההעברה תירשם בין השותפים בדיוק כמו העברה שנרשמת ידנית. לא נוצרת הוצאה, ואין חלוקה
          בין השותפים.
        </p>

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Sheet>
  );
}
