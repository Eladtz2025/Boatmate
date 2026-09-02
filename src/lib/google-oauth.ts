import "server-only";

/**
 * Google's authorization-code flow, server side.
 *
 * Deliberately not the browser flow. The code is exchanged here, using the
 * client secret, and the refresh token that comes back never leaves the server
 * — which is also why the callback is a Route Handler under `/api/` rather than
 * a page under `/auth/`: `proxy.ts` treats `/auth` as public, and a token
 * exchange reachable without a session is not something to hand to the
 * internet. See `src/app/api/google/callback/route.ts`.
 *
 * Configure with `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET`. Absent, every
 * entry point reports "not configured" rather than half-working.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Read-only, and nothing else. Widening this needs re-consent from Google. */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const TIMEOUT_MS = 10_000;

const tidy = (value: string | undefined): string =>
  value?.replace(/^\uFEFF/, "").trim() ?? "";

type Client = { id: string; secret: string };

function client(): Client | null {
  const id = tidy(process.env.GMAIL_CLIENT_ID);
  const secret = tidy(process.env.GMAIL_CLIENT_SECRET);
  if (!id || !secret) return null;
  return { id, secret };
}

export function isGmailConfigured(): boolean {
  return client() !== null;
}

/**
 * Where the callback lives, absolute, and it has to match what is registered in
 * Google Cloud byte for byte.
 *
 * Built from `NEXT_PUBLIC_SITE_URL` so local development and production each
 * send Google their own origin — a hardcoded production URL would silently
 * bounce every local consent back to the deployed site.
 */
export function redirectUri(): string {
  const base = tidy(process.env.NEXT_PUBLIC_SITE_URL) || "http://localhost:3000";
  return `${base.replace(/\/+$/, "")}/api/google/callback`;
}

/**
 * The consent URL.
 *
 * `access_type=offline` with `prompt=consent` because Google returns a refresh
 * token **only** on a fresh consent: re-authorising an already-granted account
 * without it hands back an access token that expires in an hour and nothing to
 * renew it with, which looks like success and stops working by lunchtime.
 */
export function authorizeUrl(state: string): string | null {
  const creds = client();
  if (!creds) return null;

  const params = new URLSearchParams({
    client_id: creds.id,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });

  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export type TokenGrant = {
  accessToken: string;
  /** Absent when Google decides not to reissue one — see `authorizeUrl`. */
  refreshToken: string | null;
  scope: string;
  expiresInSeconds: number;
};

async function postToken(body: URLSearchParams): Promise<TokenGrant> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    // The body carries Google's own reason (invalid_grant, redirect_uri
    // mismatch); it belongs in the server log, not on a phone.
    console.error("[google-oauth] token", response.status, text.slice(0, 400));
    throw new Error(`google token ${response.status}`);
  }

  const parsed = JSON.parse(text) as {
    access_token: string;
    refresh_token?: string;
    scope?: string;
    expires_in?: number;
  };

  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? null,
    scope: parsed.scope ?? GMAIL_SCOPE,
    expiresInSeconds: parsed.expires_in ?? 3600,
  };
}

/** Consent code → tokens. Throws; the callback route turns that into a page. */
export async function exchangeCode(code: string): Promise<TokenGrant> {
  const creds = client();
  if (!creds) throw new Error("GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET are not set");

  return postToken(
    new URLSearchParams({
      code,
      client_id: creds.id,
      client_secret: creds.secret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  );
}

/** Refresh token → a fresh access token. The refresh token itself is reused. */
export async function refreshAccessToken(refreshToken: string): Promise<TokenGrant> {
  const creds = client();
  if (!creds) throw new Error("GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET are not set");

  return postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: creds.id,
      client_secret: creds.secret,
      grant_type: "refresh_token",
    }),
  );
}

/** Which mailbox was just connected, for the Settings line. Best effort. */
export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      },
    );
    if (!response.ok) return null;
    const profile = (await response.json()) as { emailAddress?: string };
    return profile.emailAddress ?? null;
  } catch {
    return null;
  }
}
