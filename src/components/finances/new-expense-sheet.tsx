"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput, MoneyInput, SelectInput, TextArea } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { createExpense } from "@/app/actions";
import { EXPENSE_CATEGORIES, expenseCategoryLabel } from "@/lib/constants";
import { parseShekelInput, toDateInput } from "@/lib/format";
import { expenseMessage, share } from "@/lib/whatsapp";
import { MemberChips } from "./member-chips";
import { ReceiptPicker } from "./receipt-picker";
import { SplitEditor } from "./split-editor";
import { buildSharePlan, emptySplitState, splitDelta, type SplitState } from "./split";
import type { FinanceMember } from "./types";

/**
 * The main money-entry flow. Order of the fields deliberately matches the
 * mockup: capture the receipt first, then category, date, amount, payer, split
 * and finally the note.
 */
export function NewExpenseSheet({
  onClose,
  boatId,
  boatName,
  members,
  currentUserId,
}: {
  onClose: () => void;
  boatId: string;
  boatName: string;
  members: FinanceMember[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const memberIds = useMemo(() => members.map((m) => m.userId), [members]);

  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0].value);
  const [spentOn, setSpentOn] = useState(() => toDateInput());
  const [amountText, setAmountText] = useState("");
  const [paidBy, setPaidBy] = useState<string | null>(
    () => currentUserId ?? members[0]?.userId ?? null,
  );
  const [splitState, setSplitState] = useState<SplitState>(() => emptySplitState());
  const [note, setNote] = useState("");
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const amountAgorot = parseShekelInput(amountText) ?? 0;
  const delta = splitDelta(amountAgorot, memberIds, splitState);
  const canConfirm =
    !busy && amountAgorot > 0 && !!paidBy && members.length > 0 && delta === 0;

  async function handleConfirm() {
    if (!paidBy || amountAgorot <= 0) {
      setError("צריך סכום ושותף ששילם");
      return;
    }

    setBusy(true);
    setError(null);

    const result = await createExpense({
      boatId,
      paidBy,
      amountAgorot,
      category,
      description: note.trim() || null,
      spentOn,
      plan: buildSharePlan(amountAgorot, memberIds, splitState),
      receiptPath,
      note: note.trim() || null,
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSavedMessage(
      expenseMessage(boatName, {
        description: note.trim() || null,
        categoryLabel: expenseCategoryLabel(category),
        amountAgorot,
        spentOn,
        paidByName: members.find((m) => m.userId === paidBy)?.name ?? "שותף",
      }),
    );
    router.refresh();
  }

  if (savedMessage) {
    return (
      <Sheet open onClose={onClose} title="ההוצאה נשמרה">
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-teal-400/15 text-teal-400">
            <CheckCheck className="size-7" aria-hidden />
          </span>
          <p className="text-sm font-medium text-ink">ההוצאה נרשמה והיתרות עודכנו</p>
          <p className="text-xs text-ink-subtle">אפשר לעדכן את השותפים בקבוצה</p>

          <div className="mt-3 flex w-full flex-col gap-2">
            <Button
              variant="primary"
              block
              icon={<Share2 className="size-4" aria-hidden />}
              onClick={() => void share(savedMessage)}
            >
              שתף בוואטסאפ
            </Button>
            <Button variant="ghost" block onClick={onClose}>
              סגירה
            </Button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="הוצאה חדשה"
      onConfirm={() => void handleConfirm()}
      confirmDisabled={!canConfirm}
      busy={busy}
      confirmLabel="שמירת הוצאה"
    >
      <div className="space-y-4">
        <ReceiptPicker boatId={boatId} path={receiptPath} onChange={setReceiptPath} />

        <SelectInput
          label="קטגוריה"
          options={EXPENSE_CATEGORIES}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />

        <DateInput
          label="התאריך"
          value={spentOn}
          onChange={(event) => setSpentOn(event.target.value)}
        />

        <MoneyInput
          label="סכום"
          placeholder="0"
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
        />

        <MemberChips
          label="שולם על ידי"
          members={members}
          value={paidBy}
          onChange={setPaidBy}
        />

        <SplitEditor
          members={members}
          amountAgorot={amountAgorot}
          state={splitState}
          onChange={setSplitState}
        />

        <TextArea
          label="הערה (אופציונלי)"
          placeholder="למשל: תדלוק לפני ההפלגה"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Sheet>
  );
}
