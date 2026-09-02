"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { syncInvoicesAction } from "@/app/actions";
import { cn } from "@/lib/cn";

/**
 * "סנכרון חשבוניות" — the whole sync UI, on purpose.
 *
 * One button and one line of result. There is no queue, no progress bar and no
 * approval step: the import either created expenses or it did not, and the
 * balances beneath it are the real feedback. A failure says what went wrong in
 * one sentence — most often that Gmail is not connected, which is a trip to
 * Settings rather than a retry.
 */
export function InvoiceSync({ boatId }: { boatId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      const outcome = await syncInvoicesAction(boatId);

      if (!outcome.ok) {
        setResult({ ok: false, text: outcome.error });
        return;
      }

      setResult({ ok: true, text: outcome.message });
      // Only worth re-reading when something actually landed.
      if (outcome.imported > 0) router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-hull-800 px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:border-teal-400/30 hover:text-ink disabled:opacity-60"
      >
        <RefreshCw
          className={cn("size-3.5", pending && "animate-spin")}
          aria-hidden
        />
        {pending ? "מסנכרן…" : "סנכרון חשבוניות"}
      </button>

      {result && (
        <span
          role="status"
          className={cn(
            "text-xs",
            result.ok ? "text-teal-400" : "text-warning",
          )}
        >
          {result.text}
        </span>
      )}
    </div>
  );
}
