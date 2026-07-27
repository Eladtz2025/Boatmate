"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Anchor, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Recovers a session from the URL fragment (implicit flow), which the server
 * never sees. Falls back to a readable error rather than a blank redirect loop.
 */
export function CallbackHandler({
  next,
  serverError,
}: {
  next: string;
  serverError: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(serverError);

  useEffect(() => {
    let cancelled = false;

    // Resolves to a message to show, or null when the sign-in succeeded.
    // Everything runs inside the promise so no setState happens synchronously
    // in the effect body.
    async function completeSignIn(): Promise<string | null> {
      const params = new URLSearchParams(window.location.hash.slice(1));

      const hashError = params.get("error_description") ?? params.get("error");
      if (hashError) return decodeURIComponent(hashError);

      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (!accessToken || !refreshToken) {
        return serverError ?? "קישור הכניסה אינו תקין או שפג תוקפו.";
      }

      const { error: sessionError } = await createClient().auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) return sessionError.message;

      // Drop the tokens from the address bar before moving on.
      window.history.replaceState(null, "", window.location.pathname);
      router.replace(next);
      return null;
    }

    completeSignIn().then((message) => {
      if (!cancelled && message) setError(message);
    });

    return () => {
      cancelled = true;
    };
  }, [next, router, serverError]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      {error ? (
        <>
          <TriangleAlert className="size-8 text-danger" aria-hidden />
          <p className="text-sm font-medium">לא הצלחנו להשלים את הכניסה</p>
          <p className="max-w-xs text-xs text-ink-muted">{error}</p>
          <Link
            href="/login"
            className="mt-2 rounded-full bg-teal-400 px-4 py-2 text-sm font-semibold text-hull-950 transition hover:bg-teal-500"
          >
            חזרה למסך הכניסה
          </Link>
        </>
      ) : (
        <>
          <Anchor className="size-8 animate-pulse text-teal-400" aria-hidden />
          <p className="text-sm text-ink-muted">מתחברים…</p>
        </>
      )}
    </main>
  );
}
