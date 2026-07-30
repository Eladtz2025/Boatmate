import { safeNext } from "@/lib/safe-next";
import { CallbackHandler } from "./callback-handler";

/**
 * Magic-link landing point. Supabase can arrive here two different ways:
 *
 *  1. PKCE — `?code=...` in the query string. Happens when the same browser
 *     that called signInWithOtp opens the link, so the code verifier is present.
 *
 *  2. Implicit — `#access_token=...&refresh_token=...` in the URL fragment.
 *     Happens when the link is opened in a different browser (tapping the email
 *     on a phone often opens a webview, not the browser that made the request),
 *     or for admin-generated links. Fragments are NEVER sent to the server, so
 *     this case can only be handled on the client.
 *
 * Both are completed in the browser, by CallbackHandler.
 *
 * The PKCE exchange used to happen right here, server-side — and it silently did
 * not work. A Server Component cannot write cookies: the exchange succeeded, the
 * SSR client's `setAll` threw, `createClient()` swallowed it (it has to, for
 * ordinary reads), and the redirect landed on a page that proxy.ts bounced
 * straight back to /login. Sign-in only works where the session cookies can
 * actually be persisted, so it belongs on the client.
 */
export default async function AuthCallbackPage({
  searchParams,
}: {
  // `code` is deliberately not read here — the browser client consumes it.
  searchParams: Promise<{ next?: string; error_description?: string }>;
}) {
  const params = await searchParams;

  // Only ever continue to a path inside this app, never an arbitrary origin.
  // This used to be a bare `startsWith("/")` test, which lets `//evil.com`
  // through — and CallbackHandler hands the value to window.location.replace.
  return (
    <CallbackHandler
      next={safeNext(params.next)}
      serverError={params.error_description ?? null}
    />
  );
}
