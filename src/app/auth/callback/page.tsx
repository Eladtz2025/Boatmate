import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CallbackHandler } from "./callback-handler";

/**
 * Magic-link landing point. Supabase can arrive here two different ways:
 *
 *  1. PKCE — `?code=...` in the query string. Happens when the same browser
 *     that called signInWithOtp opens the link, so the code verifier cookie is
 *     present. Exchanged server-side, below.
 *
 *  2. Implicit — `#access_token=...&refresh_token=...` in the URL fragment.
 *     Happens when the link is opened in a different browser (tapping the email
 *     on a phone often opens a webview, not the browser that made the request),
 *     or for admin-generated links. Fragments are NEVER sent to the server, so
 *     this case can only be handled on the client.
 *
 * Handling only the first would strand anyone in the second case on an error
 * page, which is a common way to arrive here from a phone.
 */
export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    next?: string;
    error_description?: string;
  }>;
}) {
  const params = await searchParams;
  const next = params.next?.startsWith("/") ? params.next : "/";

  if (params.code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (!error) redirect(next);

    return <CallbackHandler next={next} serverError={error.message} />;
  }

  return (
    <CallbackHandler next={next} serverError={params.error_description ?? null} />
  );
}
