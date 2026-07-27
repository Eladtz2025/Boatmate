"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Share2, Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ErrorNote } from "@/components/ui/empty-state";
import { deleteExpense } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import { BUCKETS, expenseCategoryLabel } from "@/lib/constants";
import { formatAgorot, formatShortDate } from "@/lib/format";
import { expenseMessage, share } from "@/lib/whatsapp";
import { CategoryTile } from "./category-icon";
import type { FinanceExpense, FinanceMember } from "./types";

const isImage = (path: string) => /\.(png|jpe?g|webp|gif|heic|heif|avif)$/i.test(path);

/** Mounted only while a row is selected, so its state is fresh every time. */
export function ExpenseDetailSheet({
  expense,
  members,
  boatName,
  onClose,
}: {
  expense: FinanceExpense;
  members: Record<string, FinanceMember>;
  boatName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const receiptPath = expense.receiptPath;

  // Private bucket: the image is fetched through a short-lived signed URL.
  useEffect(() => {
    if (!receiptPath) return;

    let cancelled = false;
    const supabase = createClient();
    void supabase.storage
      .from(BUCKETS.receipts)
      .createSignedUrl(receiptPath, 3600)
      .then(({ data }) => {
        if (cancelled) return;
        // A missing/denied object must not leave the panel stuck on "טוען קבלה…".
        if (data?.signedUrl) setReceiptUrl(data.signedUrl);
        else setReceiptError(true);
      })
      .catch(() => {
        if (!cancelled) setReceiptError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [receiptPath]);

  const payer = members[expense.paidBy];
  const title = expense.description || expenseCategoryLabel(expense.category);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const result = await deleteExpense(expense.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title="פרטי הוצאה">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <CategoryTile category={expense.category} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{title}</p>
            <p className="text-xs text-ink-subtle">
              {expenseCategoryLabel(expense.category)} ·{" "}
              <span className="numeric">{formatShortDate(expense.spentOn)}</span>
            </p>
          </div>
          {expense.source === "recurring" && <Badge tone="teal">קבוע</Badge>}
        </div>

        <div className="card p-4 text-center">
          <p className="numeric text-3xl font-bold">{formatAgorot(expense.amountAgorot)}</p>
          <p className="mt-1 flex items-center justify-center gap-2 text-xs text-ink-muted">
            שולם על ידי
            <Avatar
              name={payer?.name ?? "שותף"}
              color={payer?.color}
              size="xs"
            />
            <span className="font-medium text-ink">{payer?.name ?? "שותף"}</span>
          </p>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-ink-muted">חלוקה בין השותפים</p>
          <ul className="space-y-2">
            {expense.shares.map((entry) => {
              const member = members[entry.userId];
              const percent =
                expense.amountAgorot > 0
                  ? Math.round((entry.shareAgorot / expense.amountAgorot) * 100)
                  : 0;
              return (
                <li
                  key={entry.userId}
                  className="flex items-center gap-3 rounded-tile border border-[var(--hairline)] bg-hull-800 px-3 py-2"
                >
                  <Avatar name={member?.name ?? "שותף"} color={member?.color} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {member?.name ?? "שותף"}
                    {entry.userId === expense.paidBy && (
                      <span className="ms-2 text-xs text-teal-400">שילם</span>
                    )}
                  </span>
                  <span className="numeric text-xs text-ink-subtle">{percent}%</span>
                  <span className="numeric text-sm font-semibold">
                    {formatAgorot(entry.shareAgorot)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {receiptPath && (
          <div>
            <p className="mb-2 text-xs font-medium text-ink-muted">קבלה</p>
            {receiptUrl && isImage(receiptPath) ? (
              <a href={receiptUrl} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={receiptUrl}
                  alt="קבלה"
                  className="max-h-72 w-full rounded-tile border border-[var(--hairline)] object-contain"
                />
              </a>
            ) : receiptUrl ? (
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center gap-2 rounded-tile border border-[var(--hairline)] bg-hull-800 px-3.5 text-sm text-teal-400"
              >
                <ExternalLink className="size-4" aria-hidden />
                פתח קבלה
              </a>
            ) : receiptError ? (
              <p className="text-xs text-danger">לא הצלחנו לטעון את הקבלה</p>
            ) : (
              <p className="text-xs text-ink-subtle">טוען קבלה…</p>
            )}
          </div>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex flex-col gap-2 pt-1">
          <Button
            variant="secondary"
            block
            icon={<Share2 className="size-4" aria-hidden />}
            onClick={() =>
              void share(
                expenseMessage(boatName, {
                  description: expense.description,
                  categoryLabel: expenseCategoryLabel(expense.category),
                  amountAgorot: expense.amountAgorot,
                  spentOn: expense.spentOn,
                  paidByName: payer?.name ?? "שותף",
                }),
              )
            }
          >
            שיתוף בוואטסאפ
          </Button>

          {confirming ? (
            <div className="space-y-2 rounded-tile border border-danger/30 bg-danger/10 p-3">
              <p className="text-xs text-danger">
                מחיקת ההוצאה תעדכן מחדש את היתרות. להמשיך?
              </p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  loading={busy}
                  onClick={() => void handleDelete()}
                >
                  כן, מחק
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                  ביטול
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              block
              icon={<Trash2 className="size-4" aria-hidden />}
              onClick={() => setConfirming(true)}
              className="text-danger hover:text-danger"
            >
              מחיקת הוצאה
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
