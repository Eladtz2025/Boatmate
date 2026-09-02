import "server-only";
import { createAdminClient } from "./supabase/admin";
import { GMAIL_SCOPE, refreshAccessToken } from "./google-oauth";

/**
 * The boat's connected mailbox: where the credential lives, and the two Gmail
 * calls the importer needs.
 *
 * Everything that touches `google_credentials` goes through the **service
 * role**. That table has RLS enabled with no policies at all, so it is
 * unreadable by any signed-in client — a refresh token is a bearer credential
 * for somebody's whole mailbox and is the one row in this schema that must
 * never be reachable from a browser, however trusted the crew are with each
 * other's expenses.
 *
 * Read-only throughout: the only scope ever requested is `gmail.readonly`.
 */

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TIMEOUT_MS = 15_000;

/** Postgres and PostgREST codes for "that table does not exist yet". */
const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

export type GmailConnection = {
  connected: boolean;
  email: string | null;
  /** Set when the row is there but unusable — a scope that no longer covers us. */
  problem: string | null;
};

export type StoredCredential = {
  refreshToken: string;
  scope: string;
  googleEmail: string | null;
};

/* -------------------------------------------------------------------------- */
/* The stored credential                                                      */
/* -------------------------------------------------------------------------- */

export async function saveGmailCredential(input: {
  boatId: string;
  refreshToken: string;
  scope: string;
  googleEmail: string | null;
  connectedBy: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("google_credentials").upsert(
    {
      boat_id: input.boatId,
      refresh_token: input.refreshToken,
      scope: input.scope,
      google_email: input.googleEmail,
      connected_by: input.connectedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "boat_id" },
  );

  if (error) {
    console.error("[gmail] save credential", error);
    return {
      ok: false,
      error: MISSING_TABLE.has(error.code)
        ? "טבלת החיבור ל-Gmail עדיין לא נוצרה במסד הנתונים."
        : "לא הצלחנו לשמור את החיבור ל-Gmail.",
    };
  }

  return { ok: true };
}

async function readCredential(
  boatId: string,
): Promise<StoredCredential | null | { error: string }> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("google_credentials")
    .select("refresh_token, scope, google_email")
    .eq("boat_id", boatId)
    .maybeSingle();

  if (error) {
    console.error("[gmail] read credential", error);
    return {
      error: MISSING_TABLE.has(error.code)
        ? "טבלת החיבור ל-Gmail עדיין לא נוצרה במסד הנתונים."
        : "לא הצלחנו לקרוא את החיבור ל-Gmail.",
    };
  }

  if (!data) return null;
  return {
    refreshToken: data.refresh_token,
    scope: data.scope,
    googleEmail: data.google_email,
  };
}

/** What Settings shows. Never returns the token, only whether there is one. */
export async function getGmailConnection(boatId: string): Promise<GmailConnection> {
  const stored = await readCredential(boatId);

  if (stored === null) return { connected: false, email: null, problem: null };
  if ("error" in stored) {
    return { connected: false, email: null, problem: stored.error };
  }

  return {
    connected: true,
    email: stored.googleEmail,
    problem: stored.scope.includes(GMAIL_SCOPE)
      ? null
      : "החיבור אינו כולל הרשאת קריאה ל-Gmail — צריך לחבר מחדש.",
  };
}

export async function deleteGmailCredential(boatId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("google_credentials")
    .delete()
    .eq("boat_id", boatId);
  if (error && !MISSING_TABLE.has(error.code)) {
    console.error("[gmail] delete credential", error);
  }
}

/* -------------------------------------------------------------------------- */
/* Talking to Gmail                                                           */
/* -------------------------------------------------------------------------- */

export type GmailSession =
  | { ok: true; accessToken: string }
  | { ok: false; reason: string };

/**
 * A usable access token, or a clear reason there is none.
 *
 * The three failures a partner can actually act on are told apart: never
 * connected, the table is missing, and a refresh token Google has stopped
 * honouring — the last of which is what a revoked or expired connection looks
 * like, and it says "connect again" rather than "something went wrong".
 */
export async function gmailSession(boatId: string): Promise<GmailSession> {
  const stored = await readCredential(boatId);

  if (stored === null) {
    return { ok: false, reason: "Gmail לא מחובר." };
  }
  if ("error" in stored) {
    return { ok: false, reason: stored.error };
  }

  try {
    const grant = await refreshAccessToken(stored.refreshToken);
    return { ok: true, accessToken: grant.accessToken };
  } catch (error) {
    console.error("[gmail] refresh", error);
    return {
      ok: false,
      reason: "החיבור ל-Gmail פג או בוטל — צריך לחבר מחדש בהגדרות.",
    };
  }
}

async function gmailGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[gmail]", path, response.status, body.slice(0, 300));
    throw new Error(`gmail ${response.status}`);
  }

  return (await response.json()) as T;
}

/**
 * Message ids from one sender, on or after a date.
 *
 * The query is built from both halves rather than trusting either alone: the
 * sender filter is the business rule, and the date floor is what bounds the
 * historical backfill. Note that `after:` is inclusive of the day in Gmail's
 * own timezone handling and that the whole window is re-read on **every** sync
 * — deliberately, because a cursor that only moved forward would silently skip
 * an email that arrived late or was delivered out of order. Skipping already
 * imported messages is `invoice_imports`' job, not the query's.
 */
export async function listInvoiceMessageIds(input: {
  accessToken: string;
  sender: string;
  /** "2026/05/01" — Gmail's own format. */
  afterDate: string;
  maxMessages?: number;
}): Promise<string[]> {
  const query = `from:${input.sender} after:${input.afterDate}`;
  const cap = input.maxMessages ?? 200;

  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(100, cap - ids.length)),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const page = await gmailGet<{
      messages?: Array<{ id: string }>;
      nextPageToken?: string;
    }>(`/messages?${params.toString()}`, input.accessToken);

    for (const message of page.messages ?? []) ids.push(message.id);
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < cap);

  return ids;
}

type GmailPart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};

/** Gmail encodes bodies base64url, and Hebrew arrives as UTF-8 underneath. */
function decodeBody(data: string): string {
  return new TextDecoder("utf-8").decode(
    Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
  );
}

/** Depth-first walk for the first part of a given type. */
function findPart(part: GmailPart, mimeType: string): string | null {
  if (part.mimeType === mimeType && part.body?.data) return decodeBody(part.body.data);
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

export type GmailMessage = {
  id: string;
  /** The HTML body, or the plain-text one when there is no HTML alternative. */
  body: string;
  subject: string | null;
  /** RFC-2822 date as an ISO string, best effort. */
  receivedAt: string | null;
};

export async function getInvoiceMessage(
  accessToken: string,
  id: string,
): Promise<GmailMessage> {
  const message = await gmailGet<{
    id: string;
    internalDate?: string;
    payload?: GmailPart & { headers?: Array<{ name: string; value: string }> };
  }>(`/messages/${id}?format=full`, accessToken);

  const payload = message.payload ?? {};
  const body =
    findPart(payload, "text/html") ?? findPart(payload, "text/plain") ?? "";

  const subject =
    payload.headers?.find((header) => header.name.toLowerCase() === "subject")
      ?.value ?? null;

  const receivedAt = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : null;

  return { id: message.id, body, subject, receivedAt };
}
