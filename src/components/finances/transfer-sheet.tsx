"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui/sheet";
import { DateInput, MoneyInput, SelectInput, TextArea } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/empty-state";
import { createTransfer } from "@/app/actions";
import { agorotToShekelInput, parseShekelInput, toDateInput } from "@/lib/format";
import type { FinanceMember } from "./types";

export type TransferPrefill = {
  fromUser?: string;
  toUser?: string;
  amountAgorot?: number;
};

/** Mounted only while open, so a prefilled settlement always starts clean. */
export function TransferSheet({
  onClose,
  boatId,
  members,
  prefill,
}: {
  onClose: () => void;
  boatId: string;
  members: FinanceMember[];
  prefill: TransferPrefill | null;
}) {
  const router = useRouter();
  const options = members.map((m) => ({ value: m.userId, label: m.name }));

  const [fromUser, setFromUser] = useState(
    () => prefill?.fromUser ?? members[0]?.userId ?? "",
  );
  const [toUser, setToUser] = useState(() => prefill?.toUser ?? members[1]?.userId ?? "");
  const [amountText, setAmountText] = useState(() =>
    prefill?.amountAgorot ? agorotToShekelInput(prefill.amountAgorot) : "",
  );
  const [transferredOn, setTransferredOn] = useState(() => toDateInput());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountAgorot = parseShekelInput(amountText) ?? 0;
  const canConfirm = !busy && amountAgorot > 0 && !!fromUser && !!toUser && fromUser !== toUser;

  async function handleConfirm() {
    setBusy(true);
    setError(null);

    const result = await createTransfer({
      boatId,
      fromUser,
      toUser,
      amountAgorot,
      transferredOn,
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
      title="רישום העברה"
      onConfirm={() => void handleConfirm()}
      confirmDisabled={!canConfirm}
      busy={busy}
      confirmLabel="שמירת העברה"
    >
      <div className="space-y-4">
        <SelectInput
          label="מי מעביר"
          options={options}
          value={fromUser}
          onChange={(event) => setFromUser(event.target.value)}
        />
        <SelectInput
          label="למי"
          options={options}
          value={toUser}
          onChange={(event) => setToUser(event.target.value)}
          error={fromUser && fromUser === toUser ? "אי אפשר להעביר לעצמך" : null}
        />
        <MoneyInput
          label="סכום"
          placeholder="0"
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
        />
        <DateInput
          label="תאריך ההעברה"
          value={transferredOn}
          onChange={(event) => setTransferredOn(event.target.value)}
        />
        <TextArea
          label="הערה (אופציונלי)"
          placeholder="למשל: העברה בביט"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Sheet>
  );
}
