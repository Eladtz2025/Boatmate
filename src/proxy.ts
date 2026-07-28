import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

/**
 * Next 16 renamed `middleware` to `proxy` (Node runtime only).
 * Refreshes the Supabase session cookie on every request and gates the app
 * behind authentication.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // These are no-store/no-cache headers, and they are not optional: a
        // response that carries a fresh auth cookie must never be cached by a
        // CDN, or one partner's session token gets served to another. We sit
        // behind Vercel's edge, so dropping them is a real hazard.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Do not remove, and do not put anything between createServerClient and this
  // call — it is what refreshes an expired session.
  //
  // getClaims, not getUser: getUser sends a request to the Auth server for
  // every single JWT, which put a full network round trip in front of every
  // page and every server action. This project signs tokens with an asymmetric
  // key (ES256), so getClaims verifies the signature locally against a cached
  // JWKS instead. Supabase documents it as the preferred way to protect pages.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims?.sub);

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/onboarding");

  if (!isSignedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isSignedIn && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, the service worker and the manifest —
     * those must stay reachable for the PWA to install and work offline.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
