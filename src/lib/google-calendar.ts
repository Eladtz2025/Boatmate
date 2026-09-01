import "server-only";
import { createSign } from "node:crypto";

/**
 * Google Calendar sync for attendance.
 *
 * There was no Google integration in this project before — no OAuth client, no
 * stored tokens, no Google dependency of any kind. This is the smallest thing
 * that actually works for the case at hand, and nothing more:
 *
 * **One shared boat calendar, reached with a service account.** The boat has
 * one calendar; every partner subscribes to it in their own Google account.
 * The server holds a single credential instead of an OAuth token per partner,
 * which is what lets attendance sync from a server action with no consent
 * screen, no refresh-token storage and — importantly here — no new database
 * table, since this repo's migrations cannot currently be applied.
 *
 * **The Google event id is derived from the Boatmate event id**, so there is
 * nothing to store on our side and the mapping cannot drift. Calendar ids must
 * be base32hex (`[a-v0-9]`, 5–1024 chars); a UUID's hex digits are a subset of
 * that, so `bm` + the UUID without dashes is always legal.
 *
 * **Sync never decides whether attendance saved.** The caller writes to
 * Postgres first and calls this afterwards; every failure here comes back as a
 * value, never a throw, and the UI says so out loud. A calendar that is behind
 * is a nuisance; an attendance that silently did not save is the bug this
 * ordering exists to prevent.
 *
 * Configure with three env vars — absent, the whole feature reports `off`
 * rather than pretending:
 *
 *   GOOGLE_CALENDAR_ID            the shared calendar's id
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL  ...@...iam.gserviceaccount.com
 *   GOOGLE_PRIVATE_KEY            the service account's PEM key
 *
 * The calendar must be shared with that service-account address, with
 * "Make changes to events".
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const API = "https://www.googleapis.com/calendar/v3/calendars";

/** Google is a courtesy here; it must never hold the page or the action open. */
const TIMEOUT_MS = 8000;

export type SyncStatus = "ok" | "off" | "failed";

export type SyncResult = {
  status: SyncStatus;
  /** Hebrew, user-facing. Only set when something went wrong. */
  message?: string;
};

const OK: SyncResult = { status: "ok" };
const OFF: SyncResult = { status: "off" };
const failed = (message: string): SyncResult => ({ status: "failed", message });

type Credentials = {
  calendarId: string;
  clientEmail: string;
  privateKey: string;
};

/**
 * Env values get pasted through dashboards, so they are trimmed here for the
 * same reason `supabase/env.ts` trims its own. The private key additionally
 * arrives with literal `\n` two-character sequences whenever it has been
 * through a single-line env field, which is almost always.
 */
/** BOM written as an escape, for the reason `supabase/env.ts` spells out. */
const tidy = (value: string | undefined): string =>
  value?.replace(/^\uFEFF/, "").trim() ?? "";

function credentials(): Credentials | null {
  const calendarId = tidy(process.env.GOOGLE_CALENDAR_ID);
  const clientEmail = tidy(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const rawKey = tidy(process.env.GOOGLE_PRIVATE_KEY);

  if (!calendarId || !clientEmail || !rawKey) return null;

  return {
    calendarId,
    clientEmail,
    privateKey: rawKey.replace(/\\n/g, "\n"),
  };
}

export function isGoogleCalendarConfigured(): boolean {
  return credentials() !== null;
}

const base64url = (value: string | Buffer): string =>
  Buffer.from(value).toString("base64url");

/** Access tokens last an hour; minting one per attendance tap would be silly. */
let cachedToken: { token: string; expiresAt: number } | null = null;

async function accessToken(creds: Credentials): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const claims = {
    iss: creds.clientEmail,
    scope: CALENDAR_SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  };

  const unsigned =
    `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.` +
    `${base64url(JSON.stringify(claims))}`;

  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(creds.privateKey)
    .toString("base64url");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`token ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const body = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return body.access_token;
}

/** Boatmate event id → a Google event id in the character set Google allows. */
export function googleEventId(eventId: string): string {
  return `bm${eventId.replace(/-/g, "").toLowerCase()}`;
}

async function call(
  creds: Credentials,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const token = await accessToken(creds);
  return fetch(`${API}/${encodeURIComponent(creds.calendarId)}/events${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
}

export type GoogleEvent = {
  /** The Boatmate `events` row id. */
  eventId: string;
  summary: string;
  description?: string;
  /** Real instants. */
  startsAt: string;
  endsAt: string;
};

/**
 * Create the event, or bring an existing one back in line — the same call
 * either way, so changing "ליום" to "לינה" cannot leave two entries behind.
 *
 * `update` (PUT) is tried first because the common case after the first save
 * is an edit; a 404 means it is not there yet and `insert` creates it *with
 * the id we chose*, which is what keeps the mapping derivable.
 */
export async function upsertGoogleEvent(event: GoogleEvent): Promise<SyncResult> {
  const creds = credentials();
  if (!creds) return OFF;

  const id = googleEventId(event.eventId);
  const body = JSON.stringify({
    id,
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.startsAt, timeZone: "Asia/Jerusalem" },
    end: { dateTime: event.endsAt, timeZone: "Asia/Jerusalem" },
    source: { title: "Boatmate", url: process.env.NEXT_PUBLIC_SITE_URL ?? "" },
  });

  try {
    const updated = await call(creds, `/${id}`, { method: "PUT", body });
    if (updated.ok) return OK;

    // 404 — never created. 410 — cancelled, and Google will not revive it
    // through PUT, so it has to be inserted again.
    if (updated.status === 404 || updated.status === 410) {
      const created = await call(creds, "", { method: "POST", body });
      if (created.ok) return OK;
      return failed(await describe(created));
    }

    return failed(await describe(updated));
  } catch (error) {
    return failed(reason(error));
  }
}

/** Cancelling attendance removes the calendar entry. Already gone is fine. */
export async function deleteGoogleEvent(eventId: string): Promise<SyncResult> {
  const creds = credentials();
  if (!creds) return OFF;

  try {
    const response = await call(creds, `/${googleEventId(eventId)}`, {
      method: "DELETE",
    });
    if (response.ok || response.status === 404 || response.status === 410) return OK;
    return failed(await describe(response));
  } catch (error) {
    return failed(reason(error));
  }
}

/**
 * A Hebrew line a partner can act on, with the raw status kept so the server
 * log still says which call failed. The body is read but not shown — a Google
 * error payload is English JSON and belongs in the log, not on a phone.
 */
async function describe(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  console.error("[google-calendar]", response.status, body.slice(0, 500));

  if (response.status === 401 || response.status === 403) {
    return "אין הרשאה ליומן Google — צריך לשתף את היומן עם חשבון השירות.";
  }
  if (response.status === 404) {
    return "יומן Google לא נמצא — צריך לבדוק את מזהה היומן.";
  }
  return `סנכרון ליומן Google נכשל (${response.status}).`;
}

function reason(error: unknown): string {
  console.error("[google-calendar]", error);
  return (error as Error)?.name === "TimeoutError"
    ? "יומן Google לא הגיב בזמן."
    : "סנכרון ליומן Google נכשל.";
}
