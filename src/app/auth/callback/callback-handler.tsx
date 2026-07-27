"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Anchor, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Completes sign-in in the browser, where session cookies can actually be
 * written, and handles both magic-link shapes:
 *
 *   - `?code=` (PKCE)  — exchanged against the verifier the browser client
 *                        stored when the link was requested.
 *   - `#access_token=` — the fragment the server never sees.
 *
 * Falls back to a readable message rather than a blank redirect loop.
 */
export function CallbackHandler({
  next,
  serverError,
}: {
  next: string;
  serverError: string | null;
}) {
  const [error, setError] = useState<string | null>(serverError);

  useEffect(() => {
    let cancelled = false;

    // Resolves to a message to show, or null when sign-in succeeded.
    // Everything runs inside the promise so no setState happens synchronously
    // in the effect body.
    async function completeSignIn(): Promise<string | null> {
      if (serverError) return serverError;

      const hash = new URLSearchParams(window.location.hash.slice(1));
      const hashError = hash.get("error_description") ?? hash.get("error");
      if (hashError) return decodeURIComponent(hashError);

      /*
       * Do NOT call exchangeCodeForSession() here. createBrowserClient runs
       * with detectSessionInUrl enabled, so merely constructing the client
       * already consumes the URL — for both link shapes, `?code=` (PKCE) and
       * `#access_token=` (implicit). A second exchange would race the library
       * and always lose: the PKCE verifier is single-use, so ours failed with
       * "code verifier not found in storage" *after* sign-in had in fact
       * succeeded. getSession() awaits that initialisation, so reading the
       * result is all that is left to do.
       */
      const supabase = createClient();
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) return sessionError.message;
      if (!data.session) return "קישור הכניסה אינו תקין או שפג תוקפו.";

      /*
       * A full document load, not router.replace(): the session cookies were
       * just written from JS, and a hard navigation is the one thing guaranteed
       * to send them to proxy.ts on the very next request. It also drops the
       * code and tokens from the address bar.
       */
      window.location.replace(next);
      return null;
    }

    completeSignIn().then((message) => {
      if (!cancelled && message) setError(message);
    });

    return () => {
      cancelled = true;
    };
  }, [next, serverError]);

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
