import "server-only";
import webpush, { WebPushError } from "web-push";
import { createAdminClient } from "./supabase/admin";

/**
 * Web Push — the boat's actual notification channel.
 *
 * The share sheet is a person deciding to tell the others. This is the app
 * telling them: when somebody marks, changes or cancels attendance, every
 * other partner's subscribed device gets a notification without anyone having
 * to remember to send one.
 *
 * Web Push rather than email or a third-party service because it needs no
 * account, no SMTP (this project deliberately sends no mail at all — see the
 * sign-in note in AGENTS.md) and no vendor: a VAPID key pair we generate
 * ourselves, the browser's own push service, and the service worker already
 * shipping in `public/sw.js`.
 *
 * Two configuration facts, and both are reported rather than hidden:
 *
 * - **VAPID keys** must be set (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
 *   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Without them this module reports
 *   `unavailable`; it never claims to have sent anything.
 * - **`push_subscriptions` must exist.** Its migration ships in
 *   `supabase/migrations/`. Until it is applied every call here comes back
 *   `unavailable` with the reason, which is what the Settings screen prints.
 *
 * Sends go through the **service role**, on purpose. A partner marking
 * attendance has to read *other* partners' endpoints, and the RLS policy on
 * that table deliberately restricts writes to your own rows; reading crew
 * endpoints to deliver to them is a server job, not a browser one.
 */

export type NotifyStatus = "sent" | "none" | "unavailable" | "failed";

export type NotifyResult = {
  status: NotifyStatus;
  /** Devices the push service accepted. */
  sent: number;
  /** Hebrew, user-facing. Set whenever the status is not "sent"/"none". */
  message?: string;
};

const tidy = (value: string | undefined): string =>
  value?.replace(/^\uFEFF/, "").trim() ?? "";

/**
 * "The table is not there yet" — i.e. the migration has not been applied.
 *
 * Two codes, because the answer depends on who noticed. PostgREST checks its
 * own schema cache first and answers `PGRST205` without ever reaching Postgres;
 * `42P01` is what Postgres itself raises, and is what comes back if the table
 * is dropped while the cache is still warm. Matching only the Postgres code
 * looked right and never fired — the message a partner actually saw was the
 * generic "we could not read the device list", which says nothing about the
 * one manual step that would fix it.
 */
const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

function vapid(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = tidy(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const privateKey = tidy(process.env.VAPID_PRIVATE_KEY);
  // A contact the push service can reach if our sends misbehave; required by
  // the VAPID spec, and the services do reject a request without one.
  const subject = tidy(process.env.VAPID_SUBJECT) || "mailto:boatmate@example.com";

  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export function isPushConfigured(): boolean {
  return vapid() !== null;
}

export type PushMessage = {
  title: string;
  body: string;
  /** Where tapping the notification should land. */
  url: string;
  /**
   * Collapse key. A second notification about the same day replaces the first
   * rather than stacking — three edits to Saturday is one fact, not three.
   */
  tag: string;
};

export type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Deliver to every subscribed device of every boat member except `exceptUserId`
 * — you do not need telling about your own tap.
 *
 * Never throws. A notification that failed to go out must not undo attendance
 * that was already written, so every failure is a value the caller can show.
 */
export async function notifyBoat(input: {
  boatId: string;
  exceptUserId: string | null;
  message: PushMessage;
}): Promise<NotifyResult> {
  const keys = vapid();
  if (!keys) {
    return {
      status: "unavailable",
      sent: 0,
      message: "התראות אוטומטיות לא מוגדרות בשרת.",
    };
  }

  const supabase = createAdminClient();

  let query = supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("boat_id", input.boatId)
    .is("expired_at", null);

  if (input.exceptUserId) query = query.neq("user_id", input.exceptUserId);

  const { data, error } = await query;

  if (error) {
    console.error("[push] read subscriptions", error);
    return {
      status: "unavailable",
      sent: 0,
      message:
        MISSING_TABLE.has(error.code)
          ? "טבלת ההתראות עדיין לא נוצרה במסד הנתונים."
          : "לא הצלחנו לקרוא את רשימת המכשירים להתראות.",
    };
  }

  const subscriptions = (data ?? []) as SubscriptionRow[];
  if (subscriptions.length === 0) {
    return {
      status: "none",
      sent: 0,
      message: "אף שותף אחר לא הפעיל התראות במכשיר שלו.",
    };
  }

  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);

  const payload = JSON.stringify(input.message);
  const dead: string[] = [];
  let sent = 0;
  let lastError: string | null = null;

  const results = await Promise.allSettled(
    subscriptions.map((row) =>
      webpush
        .sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          payload,
          { TTL: 24 * 60 * 60 },
        )
        .then(() => row),
    ),
  );

  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") {
      sent += 1;
      continue;
    }

    const reason = result.reason as WebPushError;
    // 404/410 mean the browser revoked this endpoint — the row is dead, not
    // the send. Mark it so it stops being retried and stops being counted.
    if (reason?.statusCode === 404 || reason?.statusCode === 410) {
      dead.push(subscriptions[index].id);
      continue;
    }

    lastError = `${reason?.statusCode ?? "?"}`;
    console.error("[push] send failed", reason?.statusCode, reason?.body);
  }

  if (dead.length > 0) {
    await supabase
      .from("push_subscriptions")
      .update({ expired_at: new Date().toISOString() })
      .in("id", dead);
  }

  if (sent > 0) return { status: "sent", sent };

  if (lastError) {
    return {
      status: "failed",
      sent: 0,
      message: `שליחת ההתראה לשותפים נכשלה (${lastError}).`,
    };
  }

  // Everything we had was revoked: honestly "nobody was reachable", not a send.
  return {
    status: "none",
    sent: 0,
    message: "המכשירים הרשומים כבר לא מקבלים התראות.",
  };
}
