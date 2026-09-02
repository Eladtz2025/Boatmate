"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui/sheet";
import { Segmented } from "@/components/ui/chips";
import { DateInput, MoneyInput, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/empty-state";
import { createRecurringPayment } from "@/app/actions";
import { CADENCES, EXPENSE_CATEGORIES, RECURRING_KINDS, type RecurringKind } from "@/lib/constants";
import { parseShekelInput, toDateInput } from "@/lib/format";
import { MemberChips } from "./member-chips";
import type { FinanceMember } from "./types";

/** Mounted only while open — every opening starts from a blank form. */
export function RecurringSheet({
  onClose,
  boatId,
  members,
  currentUserId,
}: {
  onClose: () => void;
  boatId: string;
  members: FinanceMember[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const memberOptions = members.map((m) => ({ value: m.userId, label: m.name }));

  const [kind, setKind] = useState<RecurringKind>("expense");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0].value);
  const [amountText, setAmountText] = useState("");
  const [cadence, setCadence] = useState<string>(CADENCES[0].value);
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [startOn, setStartOn] = useState(() => toDateInput());
  const [defaultPaidBy, setDefaultPaidBy] = useState<string | null>(
    () => currentUserId ?? members[0]?.userId ?? null,
  );
  const [fromUser, setFromUser] = useState(
    () => currentUserId ?? members[0]?.userId ?? "",
  );
  const [toUser, setToUser] = useState(
    () => members.find((m) => m.userId !== (currentUserId ?? members[0]?.userId))?.userId ?? "",
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isTransfer = kind === "transfer";
  const amountAgorot = parseShekelInput(amountText) ?? 0;
  const day = Number(dayOfMonth);
  const dayValid = Number.isInteger(day) && day >= 1 && day <= 28;
  const partiesValid = !isTransfer || (!!fromUser && !!toUser && fromUser !== toUser);
  const canConfirm =
    !busy && title.trim().length > 0 && amountAgorot > 0 && dayValid && partiesValid;

  async function handleConfirm() {
    setBusy(true);
    setError(null);

    const result = await createRecurringPayment({
      boatId,
      title: title.trim(),
      kind,
      // A direct transfer is not a boat cost, so it gets no category of its
      // own — the column is NOT NULL, and 'other' is what it has always meant.
      category: isTransfer ? "other" : category,
      amountAgorot,
      cadence,
      dayOfMonth: day,
      startOn,
      defaultPaidBy: isTransfer ? null : defaultPaidBy,
      fromUser: isTransfer ? fromUser : null,
      toUser: isTransfer ? toUser : null,
      notes: notes.trim() || null,
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
      title="הוראת קבע חדשה"
      onConfirm={() => void handleConfirm()}
      confirmDisabled={!canConfirm}
      busy={busy}
      confirmLabel="שמירת הוראת קבע"
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-ink-muted">סוג ההוראה</p>
          <Segmented options={RECURRING_KINDS} value={kind} onChange={setKind} />
          <p className="text-xs text-ink-subtle">
            {isTransfer
              ? "תשלום ישיר משותף לשותף. לא מתחלק בין השותפים — נרשם כהעברה."
              : "הוצאה על הסירה, שמתחלקת בין השותפים בעת אישור התשלום."}
          </p>
        </div>

        <TextInput
          label="שם ההוראה"
          placeholder={isTransfer ? "למשל: החזר חודשי" : "למשל: שכירות חודשית"}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />

        {!isTransfer && (
          <SelectInput
            label="קטגוריה"
            options={EXPENSE_CATEGORIES}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        )}

        {isTransfer && (
          <>
            <SelectInput
              label="מי מעביר"
              options={memberOptions}
              value={fromUser}
              onChange={(event) => setFromUser(event.target.value)}
            />
            <SelectInput
              label="למי"
              options={memberOptions}
              value={toUser}
              onChange={(event) => setToUser(event.target.value)}
              error={fromUser && fromUser === toUser ? "אי אפשר להעביר לעצמך" : null}
            />
          </>
        )}

        <MoneyInput
          label="סכום"
          placeholder="0"
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
        />

        <SelectInput
          label="תדירות"
          options={CADENCES}
          value={cadence}
          onChange={(event) => setCadence(event.target.value)}
        />

        <TextInput
          label="יום החיוב בחודש"
          type="number"
          min={1}
          max={28}
          dir="ltr"
          className="numeric text-start"
          hint="בין 1 ל‑28, כדי שהחיוב יתקיים בכל חודש"
          error={dayOfMonth !== "" && !dayValid ? "יום לא תקין" : null}
          value={dayOfMonth}
          onChange={(event) => setDayOfMonth(event.target.value)}
        />

        <DateInput
          label="תאריך התחלה"
          value={startOn}
          onChange={(event) => setStartOn(event.target.value)}
        />

        {/* A direct transfer has no payer to choose: whoever is named above
            pays it, and there is nothing to split. */}
        {!isTransfer && (
          <MemberChips
            label="משלם כברירת מחדל"
            members={members}
            value={defaultPaidBy}
            onChange={setDefaultPaidBy}
          />
        )}

        <TextArea
          label="הערה (אופציונלי)"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Sheet>
  );
}
