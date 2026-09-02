import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, fetchGoogleEmail } from "@/lib/google-oauth";
import { saveGmailCredential } from "@/lib/gmail";
import { getBoat, getCurrentUser } from "@/lib/data";

/**
 * Where Google sends the browser back after consent.
 *
 * A Route Handler, not a page, because the code has to be exchanged with the
 * client secret and that can only happen on the server — the opposite of
 * `/auth/callback`, which is a client page precisely because Supabase's PKCE
 * verifier lives in the browser.
 *
 * Under `/api/` rather than `/auth/` because `proxy.ts` treats `/auth` as
 * public: a token exchange reachable without a session would let anyone who
 * finds the URL bind a mailbox to this boat. Here the proxy gates it, and
 * Google's redirect is a top-level GET so the `SameSite=Lax` session cookie
 * rides along and the gate passes for the partner who started the flow.
 *
 * Nothing is ever returned to the browser but a redirect. The refresh token is
 * written straight to `google_credentials` through the service role and does
 * not appear in the response, the URL, or any log line.
 */

export const dynamic = "force-dynamic";

/** Back to Settings, saying how it went. */
function settings(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/settings", request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // The user declined, or Google refused. `error` is Google's own word for it.
  const denied = params.get("error");
  if (denied) {
    return settings(request, { gmail: "denied" });
  }

  const code = params.get("code");
  if (!code) return settings(request, { gmail: "missing_code" });

  const [user, boat] = await Promise.all([getCurrentUser(), getBoat()]);

  // The proxy should have caught this, but a session can expire between the
  // consent screen and the return trip.
  if (!user) return settings(request, { gmail: "signed_out" });
  if (!boat) return settings(request, { gmail: "no_boat" });

  // `state` is the boat this consent was started for. A mismatch means the
  // round trip did not begin where it ended, and binding a mailbox on that
  // basis is exactly the confused-deputy this check exists to stop.
  const state = params.get("state");
  if (!state || state !== boat.id) {
    return settings(request, { gmail: "state_mismatch" });
  }

  try {
    const grant = await exchangeCode(code);

    // Google only issues a refresh token on a fresh consent. Without one there
    // is nothing to store that would still work in an hour, so this is a
    // failure and is reported as one rather than looking like success.
    if (!grant.refreshToken) {
      return settings(request, { gmail: "no_refresh_token" });
    }

    const googleEmail = await fetchGoogleEmail(grant.accessToken);

    const saved = await saveGmailCredential({
      boatId: boat.id,
      refreshToken: grant.refreshToken,
      scope: grant.scope,
      googleEmail,
      connectedBy: user.id,
    });

    if (!saved.ok) return settings(request, { gmail: "save_failed" });

    return settings(request, { gmail: "connected" });
  } catch (error) {
    console.error("[google-callback]", error);
    return settings(request, { gmail: "exchange_failed" });
  }
}
