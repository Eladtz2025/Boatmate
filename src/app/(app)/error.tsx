"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The boundary the reads in lib/data.ts throw into.
 *
 * It exists so a failed query can say so. Before it, every read ended in
 * `data ?? []` and a database outage rendered as an empty screen — worst of all
 * on the home tile, which read "כולם מאוזנים" when it had simply failed to load
 * a single expense. An honest error is always better than a confident ₪0.
 *
 * Deliberately does not offer to "continue anyway": there is nothing to continue
 * to, and money read from a partial result is the thing we are avoiding.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Nothing collects this yet — no Sentry, no instrumentation.ts. It at least
    // reaches the Vercel function logs, which is the only place the owner can
    // currently find out that a partner hit this.
    console.error("[boatmate] render failed", error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-8 pb-24 text-center">
      <AlertTriangle className="size-10 text-warning" aria-hidden />

      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-semibold">משהו לא נטען</h1>
        <p className="text-sm text-ink-muted">
          לא הצלחנו לקרוא את הנתונים מהשרת, ולכן אנחנו לא מציגים כלום — עדיף
          מלהראות מספרים שאולי לא נכונים.
        </p>
      </div>

      {/* The message is ours (ReadError names what failed in Hebrew), so it is
          worth showing — it is the difference between "the app is broken" and
          "the expenses did not load". */}
      {error.message && (
        <p className="max-w-xs rounded-2xl bg-hull-800 px-4 py-2 text-xs text-ink-subtle">
          {error.message}
        </p>
      )}

      <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
        <Button icon={<RotateCw className="size-4" aria-hidden />} onClick={reset} block>
          נסו שוב
        </Button>
        <Link
          href="/"
          className="text-sm text-ink-muted underline-offset-4 transition hover:text-ink hover:underline"
        >
          חזרה לדף הבית
        </Link>
      </div>
    </main>
  );
}
