"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { splitEqual, splitByPercent } from "@/lib/balance";
import {
  attendanceWindow,
  dayRange,
  segmentsLabel,
  segmentsNote,
  sortSegments,
  type Segment,
} from "@/lib/attendance";
import {
  deleteGoogleEvent,
  upsertGoogleEvent,
  type SyncResult,
} from "@/lib/google-calendar";
import { notifyBoat, type NotifyResult } from "@/lib/push";
import { formatLongDate } from "@/lib/format";
import { topUpOccurrences } from "@/lib/recurring";
import { BUCKETS } from "@/lib/constants";

/**
 * Every mutation in the app. Files are uploaded straight from the browser to
 * Supabase Storage (RLS applies there too); these actions only ever receive
 * the resulting object path.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const ok = (): ActionResult => ({ ok: true });
const fail = (error: string): ActionResult => ({ ok: false, error });

function refresh(...paths: string[]) {
  for (const path of paths) revalidatePath(path);
}

/* -------------------------------------------------------------------------- */
/* Boat + crew                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Used directly as a `<form action>`, so it must resolve to void. Failures come
 * back as an `?error=` param on the onboarding page rather than a return value.
 */
export async function createBoat(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/onboarding?error=" + encodeURIComponent("צריך שם לסירה"));

  const { error } = await supabase.from("boats").insert({
    name,
    tagline: String(formData.get("tagline") ?? "").trim() || null,
    home_port: String(formData.get("home_port") ?? "").trim() || null,
    model: String(formData.get("model") ?? "").trim() || null,
    created_by: user.id,
  });

  if (error) redirect("/onboarding?error=" + encodeURIComponent(error.message));

  refresh("/", "/finances", "/documents", "/calendar");
  redirect("/");
}

export async function updateBoat(
  boatId: string,
  patch: {
    name?: string;
    tagline?: string | null;
    statusText?: string | null;
    photoPath?: string | null;
    homePort?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  },
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("boats")
    .update({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.tagline !== undefined && { tagline: patch.tagline }),
      ...(patch.statusText !== undefined && { status_text: patch.statusText }),
      ...(patch.photoPath !== undefined && { photo_path: patch.photoPath }),
      ...(patch.homePort !== undefined && { home_port: patch.homePort }),
      ...(patch.latitude !== undefined && { latitude: patch.latitude }),
      ...(patch.longitude !== undefined && { longitude: patch.longitude }),
    })
    .eq("id", boatId);

  if (error) return fail(error.message);
  refresh("/");
  return ok();
}

/* -------------------------------------------------------------------------- */
/* Expenses                                                                   */
/* -------------------------------------------------------------------------- */

export type SharePlan =
  | { mode: "equal"; userIds: string[] }
  | { mode: "percent"; weights: Array<{ userId: string; percent: number }> }
  | { mode: "custom"; shares: Array<{ userId: string; shareAgorot: number }> };

function resolveShares(amountAgorot: number, plan: SharePlan) {
  if (plan.mode === "equal") return splitEqual(amountAgorot, plan.userIds);
  if (plan.mode === "percent") return splitByPercent(amountAgorot, plan.weights);
  return plan.shares;
}

export async function createExpense(input: {
  boatId: string;
  paidBy: string;
  amountAgorot: number;
  category: string;
  description?: string | null;
  spentOn: string;
  plan: SharePlan;
  receiptPath?: string | null;
  note?: string | null;
}): Promise<ActionResult> {
  if (!Number.isInteger(input.amountAgorot) || input.amountAgorot <= 0) {
    return fail("סכום לא תקין");
  }

  let shares;
  try {
    shares = resolveShares(input.amountAgorot, input.plan);
  } catch (error) {
    return fail((error as Error).message);
  }

  const total = shares.reduce((sum, s) => sum + s.shareAgorot, 0);
  if (total !== input.amountAgorot) {
    return fail("החלוקה בין השותפים לא מסתכמת לסכום ההוצאה");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_expense", {
    p_boat_id: input.boatId,
    p_paid_by: input.paidBy,
    p_amount_agorot: input.amountAgorot,
    p_shares: shares.map((s) => ({ user_id: s.userId, share_agorot: s.shareAgorot })),
    p_category: input.category,
    // These RPC args default to NULL in SQL, so the generated type makes them
    // optional — undefined, not null.
    p_description: input.description ?? undefined,
    p_spent_on: input.spentOn,
    p_split_mode: input.plan.mode,
    p_receipt_path: input.receiptPath ?? undefined,
    p_note: input.note ?? undefined,
    p_source: "manual",
  });

  if (error) return fail(error.message);
  refresh("/", "/finances");
  return ok();
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  // Read the receipt path before the row goes, the way deleteDocument and
  // deleteMedia already do. Without this the object stayed in the bucket
  // forever with nothing left pointing at it — and deleting an expense is the
  // only way to correct a wrong amount, so it is a routine act, not a rare one.
  const { data: expense } = await supabase
    .from("expenses")
    .select("receipt_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) return fail(error.message);

  if (expense?.receipt_path) {
    await supabase.storage.from(BUCKETS.receipts).remove([expense.receipt_path]);
  }

  refresh("/", "/finances");
  return ok();
}

/* -------------------------------------------------------------------------- */
/* Transfers                                                                  */
/* -------------------------------------------------------------------------- */

export async function createTransfer(input: {
  boatId: string;
  fromUser: string;
  toUser: string;
  amountAgorot: number;
  transferredOn: string;
  note?: string | null;
}): Promise<ActionResult> {
  if (input.fromUser === input.toUser) return fail("אי אפשר להעביר לעצמך");
  if (!Number.isInteger(input.amountAgorot) || input.amountAgorot <= 0) {
    return fail("סכום לא תקין");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("transfers").insert({
    boat_id: input.boatId,
    from_user: input.fromUser,
    to_user: input.toUser,
    amount_agorot: input.amountAgorot,
    transferred_on: input.transferredOn,
    note: input.note ?? null,
    created_by: user?.id ?? null,
  });

  if (error) return fail(error.message);
  refresh("/", "/finances");
  return ok();
}

export async function deleteTransfer(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("transfers").delete().eq("id", id);
  if (error) return fail(error.message);
  refresh("/", "/finances");
  return ok();
}

/* -------------------------------------------------------------------------- */
/* Recurring payments                                                         */
/* -------------------------------------------------------------------------- */

export async function createRecurringPayment(input: {
  boatId: string;
  title: string;
  category: string;
  amountAgorot: number;
  cadence: string;
  dayOfMonth: number;
  startOn: string;
  defaultPaidBy?: string | null;
  notes?: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("recurring_payments").insert({
    boat_id: input.boatId,
    title: input.title,
    category: input.category,
    amount_agorot: input.amountAgorot,
    cadence: input.cadence,
    day_of_month: input.dayOfMonth,
    start_on: input.startOn,
    default_paid_by: input.defaultPaidBy ?? null,
    notes: input.notes ?? null,
    created_by: user?.id ?? null,
  });

  if (error) return fail(error.message);

  // Materialise the upcoming due dates so they show on the calendar at once.
  // The finances and calendar pages call this too, on every read — see
  // lib/recurring.ts for why one call at creation time was not enough.
  await topUpOccurrences(input.boatId);

  refresh("/", "/finances", "/calendar");
  return ok();
}

export async function setRecurringActive(id: string, active: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("recurring_payments").update({ active }).eq("id", id);
  if (error) return fail(error.message);
  refresh("/finances");
  return ok();
}

export async function deleteRecurringPayment(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("recurring_payments").delete().eq("id", id);
  if (error) return fail(error.message);
  refresh("/finances", "/calendar");
  return ok();
}

/**
 * The only path from a standing order to a real expense — this is what makes
 * a pending payment start affecting balances.
 */
export async function confirmRecurringPayment(input: {
  occurrenceId: string;
  paidBy: string;
  amountAgorot: number;
  paidOn: string;
  plan: SharePlan;
  receiptPath?: string | null;
}): Promise<ActionResult> {
  let shares;
  try {
    shares = resolveShares(input.amountAgorot, input.plan);
  } catch (error) {
    return fail((error as Error).message);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_recurring_occurrence", {
    p_occurrence_id: input.occurrenceId,
    p_shares: shares.map((s) => ({ user_id: s.userId, share_agorot: s.shareAgorot })),
    p_paid_by: input.paidBy,
    p_amount_agorot: input.amountAgorot,
    p_paid_on: input.paidOn,
    p_receipt_path: input.receiptPath ?? undefined,
  });

  if (error) return fail(error.message);
  refresh("/", "/finances", "/calendar");
  return ok();
}

export async function skipRecurringOccurrence(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_occurrences")
    .update({ status: "skipped" })
    .eq("id", id);
  if (error) return fail(error.message);
  refresh("/finances", "/calendar");
  return ok();
}

/* -------------------------------------------------------------------------- */
/* Documents                                                                  */
/* -------------------------------------------------------------------------- */

export async function createDocument(input: {
  boatId: string;
  title: string;
  category: string;
  filePath: string;
  originalName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  issuedOn?: string | null;
  expiresOn?: string | null;
  reminderDays?: number;
  notes?: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("documents").insert({
    boat_id: input.boatId,
    title: input.title,
    category: input.category,
    file_path: input.filePath,
    original_name: input.originalName ?? null,
    mime_type: input.mimeType ?? null,
    size_bytes: input.sizeBytes ?? null,
    issued_on: input.issuedOn || null,
    expires_on: input.expiresOn || null,
    reminder_days: input.reminderDays ?? 30,
    notes: input.notes ?? null,
    uploaded_by: user?.id ?? null,
  });

  if (error) return fail(error.message);
  refresh("/documents", "/calendar", "/");
  return ok();
}

export async function updateDocument(
  id: string,
  patch: {
    title?: string;
    category?: string;
    filePath?: string;
    originalName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    issuedOn?: string | null;
    expiresOn?: string | null;
    reminderDays?: number;
    notes?: string | null;
  },
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .update({
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.category !== undefined && { category: patch.category }),
      ...(patch.filePath !== undefined && { file_path: patch.filePath }),
      ...(patch.originalName !== undefined && { original_name: patch.originalName }),
      ...(patch.mimeType !== undefined && { mime_type: patch.mimeType }),
      ...(patch.sizeBytes !== undefined && { size_bytes: patch.sizeBytes }),
      ...(patch.issuedOn !== undefined && { issued_on: patch.issuedOn || null }),
      ...(patch.expiresOn !== undefined && { expires_on: patch.expiresOn || null }),
      ...(patch.reminderDays !== undefined && { reminder_days: patch.reminderDays }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return fail(error.message);
  refresh("/documents", "/calendar");
  return ok();
}

/** Removes the storage object as well, so replaced files do not pile up. */
export async function deleteDocument(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("file_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) return fail(error.message);

  if (doc?.file_path) {
    await supabase.storage.from("documents").remove([doc.file_path]);
  }

  refresh("/documents", "/calendar", "/");
  return ok();
}

/* -------------------------------------------------------------------------- */
/* Events + tasks                                                             */
/* -------------------------------------------------------------------------- */

export async function createEvent(input: {
  boatId: string;
  kind: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  allDay?: boolean;
  location?: string | null;
  notes?: string | null;
  userId?: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("events").insert({
    boat_id: input.boatId,
    kind: input.kind,
    title: input.title,
    starts_at: input.startsAt,
    ends_at: input.endsAt || null,
    all_day: input.allDay ?? false,
    location: input.location ?? null,
    notes: input.notes ?? null,
    user_id: input.userId ?? null,
    created_by: user?.id ?? null,
  });

  if (error) return fail(error.message);
  refresh("/", "/calendar");
  return ok();
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) return fail(error.message);
  refresh("/", "/calendar");
  return ok();
}

/* -------------------------------------------------------------------------- */
/* Push notifications                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Registers this browser to receive the boat's notifications.
 *
 * Upserted on `endpoint`, which is unique: a browser that re-subscribes — after
 * a permission reset, or a key rotation — must replace its row rather than add
 * one, or that device gets notified twice about everything.
 *
 * The failure worth naming separately is the missing table: until
 * `supabase/migrations/20260902120000_push_subscriptions.sql` has been applied
 * this returns a message saying exactly that, instead of a raw Postgres error
 * that reads like a bug.
 */
export async function savePushSubscription(input: {
  boatId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("צריך להתחבר מחדש");

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      boat_id: input.boatId,
      user_id: user.id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent ?? null,
      expired_at: null,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    // PostgREST answers PGRST205 from its schema cache; 42P01 is Postgres's
    // own code. Both mean the migration has not been applied — see push.ts.
    if (error.code === "42P01" || error.code === "PGRST205") {
      return fail(
        "טבלת ההתראות עדיין לא נוצרה במסד הנתונים — צריך להריץ את המיגרציה.",
      );
    }
    return fail(error.message);
  }

  refresh("/settings");
  return ok();
}

/** Unsubscribes this browser. The row goes; other devices keep working. */
export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    return fail(error.message);
  }

  refresh("/settings");
  return ok();
}

/* -------------------------------------------------------------------------- */
/* Attendance                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The result of marking attendance.
 *
 * `ok` says whether the boat's own record changed — the only thing a partner
 * is really asking about. `notify` and `sync` report the two things that hang
 * off it, each separately, so a push service or a calendar being down can be
 * *said* rather than either hidden or mistaken for a failed save.
 */
export type AttendanceResult =
  | { ok: true; notify: NotifyResult; sync: SyncResult; eventId: string }
  | { ok: false; error: string };

const failAttendance = (error: string): AttendanceResult => ({ ok: false, error });

/**
 * Tell the other partners. The message is deliberately thin — who, when, and
 * day or night — because it is rendered by the operating system and lands on a
 * lock screen, the one surface in this app that is not behind the auth gate.
 *
 * `tag` collapses repeats per partner per day: changing Saturday from "ליום"
 * to "לינה" replaces the earlier notification instead of stacking a second.
 */
function attendanceNotice(input: {
  boatId: string;
  actorId: string | null;
  boatName: string;
  partnerName: string;
  dateKey: string;
  segments: Segment[];
  cancelled: boolean;
}): Promise<NotifyResult> {
  const when = formatLongDate(input.dateKey);

  return notifyBoat({
    boatId: input.boatId,
    exceptUserId: input.actorId,
    message: {
      title: input.boatName,
      body: input.cancelled
        ? `${input.partnerName} ביטל/ה הגעה — ${when}`
        : `${input.partnerName} מגיע/ה לסירה — ${when}, ${segmentsLabel(input.segments)}`,
      url: "/calendar",
      tag: `attendance:${input.actorId ?? "unknown"}:${input.dateKey}`,
    },
  });
}

/**
 * Who this is and which boat, read from the database rather than taken from
 * the caller.
 *
 * Both strings end up on other people's lock screens, and the partner name is
 * also what gets written into the event title and the Google summary. Trusting
 * the browser for either would mean any partner could choose what the others
 * are told they are looking at; the crew are equals here, not each other's
 * copywriters.
 */
async function identify(
  supabase: Awaited<ReturnType<typeof createClient>>,
  boatId: string,
  userId: string,
): Promise<{ partnerName: string; boatName: string }> {
  const [member, boat] = await Promise.all([
    supabase
      .from("boat_members")
      .select("display_name, profiles(full_name)")
      .eq("boat_id", boatId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("boats").select("name").eq("id", boatId).maybeSingle(),
  ]);

  const profile = member.data?.profiles as { full_name: string | null } | null;

  return {
    partnerName: member.data?.display_name || profile?.full_name || "שותף",
    boatName: boat.data?.name || "Boatmate",
  };
}

/**
 * Set — or change — who is on the boat on a given day.
 *
 * Idempotent by construction: it looks for this partner's existing arrival on
 * that Israel calendar day and updates it, so tapping "מגיע!" twice, or
 * switching "ליום" to "לינה", can never leave two rows behind. Any extra rows
 * a past double-tap did leave are cleaned up here rather than being rendered
 * as two people.
 *
 * Notifying the crew and syncing Google both happen *after* the row is safely
 * written, and both hand their failures back as values rather than throwing —
 * attendance saving is not allowed to depend on a push service or a calendar
 * being up.
 */
export async function setAttendance(input: {
  boatId: string;
  dateKey: string;
  /** Which parts of the day. At least one; order does not matter. */
  segments: Segment[];
  /** Whose attendance. Defaults to the caller. */
  userId?: string;
}): Promise<AttendanceResult> {
  const segments = sortSegments(input.segments ?? []);
  if (segments.length === 0) {
    return failAttendance("צריך לבחור לפחות חלק אחד מהיום");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = input.userId ?? user?.id;
  if (!userId) return failAttendance("צריך להתחבר מחדש");

  const { partnerName, boatName } = await identify(supabase, input.boatId, userId);
  const { startsAt, endsAt } = attendanceWindow(input.dateKey, segments);
  const { from, to } = dayRange(input.dateKey);

  const { data: existing, error: readError } = await supabase
    .from("events")
    .select("id")
    .eq("boat_id", input.boatId)
    .eq("kind", "arrival")
    .eq("user_id", userId)
    .gte("starts_at", from)
    .lt("starts_at", to)
    .order("starts_at");

  if (readError) return failAttendance(readError.message);

  const row = {
    boat_id: input.boatId,
    kind: "arrival",
    title: partnerName,
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: false,
    // The exact selection, because the two ends cannot always carry it — see
    // lib/attendance.ts. Overwritten on every save, so an edit never leaves a
    // stale marker behind the new times.
    notes: segmentsNote(segments),
    user_id: userId,
    created_by: user?.id ?? null,
  };

  let eventId: string;

  if (existing && existing.length > 0) {
    eventId = existing[0].id;

    const { error } = await supabase.from("events").update(row).eq("id", eventId);
    if (error) return failAttendance(error.message);

    // Defensive: an older double-tap could have left a second row for the same
    // partner on the same day, and two rows read as two people coming.
    const duplicates = existing.slice(1).map((item) => item.id);
    if (duplicates.length > 0) {
      await supabase.from("events").delete().in("id", duplicates);
      for (const id of duplicates) await deleteGoogleEvent(id);
    }
  } else {
    const { data: created, error } = await supabase
      .from("events")
      .insert(row)
      .select("id")
      .single();

    if (error) return failAttendance(error.message);
    eventId = created.id;
  }

  // Both legs are independent of each other and of the save that already
  // happened, so they run together rather than making the partner wait twice.
  const [notify, sync] = await Promise.all([
    attendanceNotice({
      boatId: input.boatId,
      actorId: userId,
      boatName,
      partnerName,
      dateKey: input.dateKey,
      segments,
      cancelled: false,
    }),
    upsertGoogleEvent({
      eventId,
      summary: `${partnerName} — ${segmentsLabel(segments)}`,
      description: "נקבע ב-Boatmate",
      startsAt,
      endsAt,
    }),
  ]);

  refresh("/", "/calendar");
  return { ok: true, notify, sync, eventId };
}

/** Cancel attendance. Removes the calendar entry too; already gone is fine. */
export async function clearAttendance(input: {
  boatId: string;
  dateKey: string;
  userId?: string;
}): Promise<AttendanceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = input.userId ?? user?.id;
  if (!userId) return failAttendance("צריך להתחבר מחדש");

  const { from, to } = dayRange(input.dateKey);

  const { data: existing, error: readError } = await supabase
    .from("events")
    .select("id")
    .eq("boat_id", input.boatId)
    .eq("kind", "arrival")
    .eq("user_id", userId)
    .gte("starts_at", from)
    .lt("starts_at", to);

  if (readError) return failAttendance(readError.message);

  const ids = (existing ?? []).map((item) => item.id);
  if (ids.length === 0) {
    // Nothing was cancelled, so there is nothing to tell anyone about.
    refresh("/", "/calendar");
    return {
      ok: true,
      notify: { status: "none", sent: 0 },
      sync: { status: "ok" },
      eventId: "",
    };
  }

  const { error } = await supabase.from("events").delete().in("id", ids);
  if (error) return failAttendance(error.message);

  const { partnerName, boatName } = await identify(supabase, input.boatId, userId);

  // Every id is removed from Google, but only the first failure is worth
  // reporting — the partner needs to know the calendar is behind, not which
  // of two duplicate rows it was behind on.
  const removals = await Promise.all(ids.map((id) => deleteGoogleEvent(id)));
  const sync = removals.find((result) => result.status !== "ok") ?? { status: "ok" as const };

  const notify = await attendanceNotice({
    boatId: input.boatId,
    actorId: userId,
    boatName,
    partnerName,
    dateKey: input.dateKey,
    segments: [],
    cancelled: true,
  });

  refresh("/", "/calendar");
  return { ok: true, notify, sync, eventId: ids[0] };
}

/* -------------------------------------------------------------------------- */
/* Shared checklist                                                           */
/* -------------------------------------------------------------------------- */

export async function createTask(input: {
  boatId: string;
  title: string;
  dueOn?: string | null;
  assignedTo?: string | null;
}): Promise<ActionResult> {
  const title = input.title.trim();
  if (!title) return fail("צריך טקסט לפריט");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("tasks").insert({
    boat_id: input.boatId,
    title,
    due_on: input.dueOn || null,
    assigned_to: input.assignedTo ?? null,
    created_by: user?.id ?? null,
  });

  if (error) return fail(error.message);
  refresh("/");
  return ok();
}

export async function setTaskDone(id: string, done: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ done, completed_at: done ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) return fail(error.message);
  refresh("/");
  return ok();
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return fail(error.message);
  refresh("/");
  return ok();
}

/* -------------------------------------------------------------------------- */
/* Media                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Removes a photo and its Storage object.
 *
 * The object has to go through the Storage API — Postgres refuses a direct
 * DELETE on storage.objects (storage.protect_delete), precisely so rows and
 * files cannot drift apart.
 */
export async function deleteMedia(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("media")
    .select("path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("media").delete().eq("id", id);
  if (error) return fail(error.message);

  if (item?.path) {
    await supabase.storage.from(BUCKETS.media).remove([item.path]);
  }

  refresh("/");
  return ok();
}

export async function createMedia(input: {
  boatId: string;
  path: string;
  caption?: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("media").insert({
    boat_id: input.boatId,
    path: input.path,
    caption: input.caption ?? null,
    uploaded_by: user?.id ?? null,
  });

  if (error) return fail(error.message);
  refresh("/");
  return ok();
}

/* -------------------------------------------------------------------------- */
/* Crew                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Adds an existing Boatmate account to the boat. The email → user id lookup
 * happens in a SECURITY DEFINER function because auth.users is not readable
 * under RLS; that function re-checks the caller's membership.
 */
export async function addPartnerByEmail(input: {
  boatId: string;
  email: string;
  displayName?: string | null;
  isRemote?: boolean;
}): Promise<ActionResult> {
  const email = input.email.trim();
  if (!email) return fail("צריך כתובת אימייל");

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_partner_by_email", {
    p_boat_id: input.boatId,
    p_email: email,
    p_display_name: input.displayName ?? undefined,
    p_is_remote: input.isRemote ?? false,
  });

  if (error) {
    // Postgres raises no_data_found when the address has no account yet.
    if (error.code === "P0002" || error.message.includes("No Boatmate account")) {
      return fail(`אין חשבון Boatmate עבור ${email}. בקשו מהם להירשם קודם.`);
    }
    return fail(error.message);
  }

  refresh("/", "/finances", "/settings");
  return ok();
}

/**
 * Renames a partner, or flags them as the one who flies in.
 *
 * The display name of whoever created the boat is otherwise never set, so it
 * falls back to the email local part ("eladtz") everywhere the crew appears.
 * Guarded by the existing "members update crew" policy — no new privileges.
 */
export async function updatePartner(input: {
  boatId: string;
  userId: string;
  displayName?: string | null;
  isRemote?: boolean;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("boat_members")
    .update({
      ...(input.displayName !== undefined && {
        display_name: input.displayName?.trim() || null,
      }),
      ...(input.isRemote !== undefined && { is_remote: input.isRemote }),
    })
    .eq("boat_id", input.boatId)
    .eq("user_id", input.userId);

  if (error) return fail(error.message);
  refresh("/", "/finances", "/calendar", "/settings");
  return ok();
}

export async function removePartner(
  boatId: string,
  userId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("boat_members")
    .delete()
    .eq("boat_id", boatId)
    .eq("user_id", userId);

  if (error) return fail(error.message);
  refresh("/", "/finances", "/settings");
  return ok();
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
