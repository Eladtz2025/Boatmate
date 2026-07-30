"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Last resort: a failure in the root layout itself, which replaces it entirely.
 *
 * It therefore has to bring its own <html> and <body> — and it cannot rely on
 * the Heebo font variable the real layout sets up, so the RTL direction and the
 * navy background are declared here directly rather than through the tokens.
 * Nothing here may import anything that could itself throw.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[boatmate] root layout failed", error);
  }, [error]);

  return (
    <html lang="he" dir="rtl" className="h-full">
      <body className="flex min-h-full flex-col items-center justify-center gap-4 bg-hull-900 px-8 text-center text-ink antialiased">
        <h1 className="text-lg font-semibold">Boatmate נתקל בתקלה</h1>
        <p className="max-w-xs text-sm text-ink-muted">
          האפליקציה לא הצליחה להיטען. נסו לרענן; אם זה חוזר, סימן שמשהו בצד
          השרת.
        </p>
        <button
          onClick={reset}
          className="h-11 rounded-2xl bg-teal-400 px-5 text-sm font-semibold text-hull-950 transition hover:bg-teal-500 active:scale-[0.98]"
        >
          רענון
        </button>
      </body>
    </html>
  );
}
