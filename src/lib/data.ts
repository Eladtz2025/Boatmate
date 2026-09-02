import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import { computeBalances, type ExpenseInput, type TransferInput } from "./balance";
import { dayRange, segmentsOf, type Attendance } from "./attendance";
import { BUCKETS } from "./constants";
import { HERO_PHOTO_ID, type GalleryPhoto } from "./gallery";
import { zonedDateKey } from "./tz";

/**
 * Server-side reads. Every query is scoped by RLS to boats the caller belongs
 * to, so none of these functions filter by user id themselves.
 *
 * `cache()` dedupes within a single render pass — the home screen asks for the
 * boat and the crew from several components without re-querying.
 *
 * Every read goes through `rows()` or `maybeRow()`, and that is not decoration.
 * These functions used to destructure `{ data }` alone and end in `data ?? []`,
 * which mapped *failure* onto *empty* — the app had no way to say "I don't
 * know". A dropped connection during `getExpenses` rendered the home screen as
 * "כולם מאוזנים": a database outage telling three partners they were square.
 * Throwing hands the failure to the nearest error boundary, which says so.
 */

type Failure = { message: string } | null;

class ReadError extends Error {
  constructor(what: string, cause: string) {
    super(`לא הצלחנו לקרוא ${what}: ${cause}`);
    this.name = "ReadError";
  }
}

/**
 * Rows from a list query. An empty list means the boat genuinely has none;
 * a failed query throws rather than impersonating one.
 */
function rows<T>(
  result: { data: T[] | null; error: Failure },
  what: string,
): T[] {
  if (result.error) throw new ReadError(what, result.error.message);
  return result.data ?? [];
}

/**
 * A single optional row. Absent is a legitimate answer (`maybeSingle` reports it
 * as `data: null, error: null`); a failed query is not.
 *
 * Inferred from the whole result rather than from `data` alone: `maybeSingle()`
 * returns a discriminated union, and matching `{ data: T | null }` against it
 * makes TypeScript infer `T` as `never` from the error branch. Indexing the
 * result type sidesteps that and keeps the real row type.
 */
function maybeRow<R extends { data: unknown; error: Failure }>(
  result: R,
  what: string,
): R["data"] {
  if (result.error) throw new ReadError(what, result.error.message);
  return result.data;
}

export type Member = {
  userId: string;
  name: string;
  color: string;
  isRemote: boolean;
};

export type Boat = {
  id: string;
  name: string;
  tagline: string | null;
  model: string | null;
  homePort: string | null;
  photoPath: string | null;
  statusText: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type CurrentUser = { id: string; email: string | null };

/**
 * Identity of the caller, taken from the verified JWT rather than from a user
 * lookup. getUser() would cost a network round trip to the Auth server on every
 * render; the id and the address are both claims already carried in the token,
 * and proxy.ts has verified its signature. Nothing here needs a fresher user
 * record than that.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  const claims = data?.claims;
  if (!claims?.sub) return null;

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
});

/** The caller's boat. MVP assumes one boat per user; the newest wins. */
export const getBoat = cache(async (): Promise<Boat | null> => {
  const supabase = await createClient();
  const data = maybeRow(
    await supabase
      .from("boats")
      .select("id, name, tagline, model, home_port, photo_path, status_text, latitude, longitude")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "את פרטי הסירה",
  );

  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    tagline: data.tagline,
    model: data.model,
    homePort: data.home_port,
    photoPath: data.photo_path,
    statusText: data.status_text,
    latitude: data.latitude,
    longitude: data.longitude,
  };
});

export const getMembers = cache(async (boatId: string): Promise<Member[]> => {
  const supabase = await createClient();
  const data = rows(
    await supabase
      .from("boat_members")
      .select("user_id, display_name, color, is_remote, profiles(full_name)")
      .eq("boat_id", boatId),
    "את רשימת השותפים",
  );

  return data.map((row) => {
    const profile = row.profiles as { full_name: string | null } | null;
    return {
      userId: row.user_id,
      name: row.display_name || profile?.full_name || "שותף",
      color: row.color,
      isRemote: row.is_remote,
    };
  });
});

/** userId → display name, for message builders and avatars. */
export async function getMemberNames(boatId: string): Promise<Record<string, string>> {
  const members = await getMembers(boatId);
  return Object.fromEntries(members.map((m) => [m.userId, m.name]));
}

/* -------------------------------------------------------------------------- */
/* Finances                                                                   */
/* -------------------------------------------------------------------------- */

export type ExpenseRow = {
  id: string;
  paidBy: string;
  amountAgorot: number;
  category: string;
  description: string | null;
  spentOn: string;
  receiptPath: string | null;
  source: string;
  shares: Array<{ userId: string; shareAgorot: number }>;
};

export const getExpenses = cache(async (boatId: string): Promise<ExpenseRow[]> => {
  const supabase = await createClient();
  const data = rows(
    await supabase
      .from("expenses")
      .select(
        "id, paid_by, amount_agorot, category, description, spent_on, receipt_path, source, expense_shares(user_id, share_agorot)",
      )
      .eq("boat_id", boatId)
      .order("spent_on", { ascending: false }),
    "את ההוצאות",
  );

  return data.map((row) => ({
    id: row.id,
    paidBy: row.paid_by,
    amountAgorot: row.amount_agorot,
    category: row.category,
    description: row.description,
    spentOn: row.spent_on,
    receiptPath: row.receipt_path,
    source: row.source,
    shares: (row.expense_shares ?? []).map((s) => ({
      userId: s.user_id,
      shareAgorot: s.share_agorot,
    })),
  }));
});

export type TransferRow = {
  id: string;
  fromUser: string;
  toUser: string;
  amountAgorot: number;
  transferredOn: string;
  note: string | null;
};

export const getTransfers = cache(async (boatId: string): Promise<TransferRow[]> => {
  const supabase = await createClient();
  const data = rows(
    await supabase
      .from("transfers")
      .select("id, from_user, to_user, amount_agorot, transferred_on, note")
      .eq("boat_id", boatId)
      .order("transferred_on", { ascending: false }),
    "את ההעברות",
  );

  return data.map((row) => ({
    id: row.id,
    fromUser: row.from_user,
    toUser: row.to_user,
    amountAgorot: row.amount_agorot,
    transferredOn: row.transferred_on,
    note: row.note,
  }));
});

/**
 * Balances, computed with the tested engine in lib/balance.ts rather than read
 * from the database view — one implementation, one place to reason about.
 */
export const getBalances = cache(async (boatId: string) => {
  const [members, expenses, transfers] = await Promise.all([
    getMembers(boatId),
    getExpenses(boatId),
    getTransfers(boatId),
  ]);

  const expenseInputs: ExpenseInput[] = expenses.map((e) => ({
    id: e.id,
    paidBy: e.paidBy,
    amountAgorot: e.amountAgorot,
    shares: e.shares,
  }));

  const transferInputs: TransferInput[] = transfers.map((t) => ({
    id: t.id,
    fromUser: t.fromUser,
    toUser: t.toUser,
    amountAgorot: t.amountAgorot,
  }));

  return computeBalances(
    members.map((m) => m.userId),
    expenseInputs,
    transferInputs,
  );
});

export type RecurringRow = {
  id: string;
  title: string;
  category: string;
  amountAgorot: number;
  cadence: string;
  dayOfMonth: number;
  active: boolean;
  defaultPaidBy: string | null;
  splitMode: string;
};

export const getRecurringPayments = cache(async (boatId: string): Promise<RecurringRow[]> => {
  const supabase = await createClient();
  const data = rows(
    await supabase
      .from("recurring_payments")
      .select("id, title, category, amount_agorot, cadence, day_of_month, active, default_paid_by, split_mode")
      .eq("boat_id", boatId)
      .order("day_of_month"),
    "את ההוראות הקבועות",
  );

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    amountAgorot: row.amount_agorot,
    cadence: row.cadence,
    dayOfMonth: row.day_of_month,
    active: row.active,
    defaultPaidBy: row.default_paid_by,
    splitMode: row.split_mode,
  }));
});

export type OccurrenceRow = {
  id: string;
  recurringPaymentId: string;
  title: string;
  category: string;
  amountAgorot: number;
  dueOn: string;
  status: string;
  defaultPaidBy: string | null;
};

/** Pending occurrences only — these never touch balances until confirmed. */
export const getUpcomingPayments = cache(
  async (boatId: string, limit = 20): Promise<OccurrenceRow[]> => {
    const supabase = await createClient();
    const data = rows(
      await supabase
        .from("recurring_occurrences")
        .select(
          "id, recurring_payment_id, amount_agorot, due_on, status, recurring_payments(title, category, default_paid_by)",
        )
        .eq("boat_id", boatId)
        .eq("status", "pending")
        .order("due_on")
        .limit(limit),
      "את התשלומים הקרובים",
    );

    return data.map((row) => {
      const parent = row.recurring_payments as {
        title: string;
        category: string;
        default_paid_by: string | null;
      } | null;
      return {
        id: row.id,
        recurringPaymentId: row.recurring_payment_id,
        title: parent?.title ?? "תשלום",
        category: parent?.category ?? "other",
        amountAgorot: row.amount_agorot,
        dueOn: row.due_on,
        status: row.status,
        defaultPaidBy: parent?.default_paid_by ?? null,
      };
    });
  },
);

/* -------------------------------------------------------------------------- */
/* Documents, calendar, tasks                                                 */
/* -------------------------------------------------------------------------- */

export type DocumentRow = {
  id: string;
  title: string;
  category: string;
  filePath: string;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  issuedOn: string | null;
  expiresOn: string | null;
  reminderDays: number;
  notes: string | null;
  createdAt: string;
};

export const getDocuments = cache(async (boatId: string): Promise<DocumentRow[]> => {
  const supabase = await createClient();
  const data = rows(
    await supabase
      .from("documents")
      .select(
        "id, title, category, file_path, original_name, mime_type, size_bytes, issued_on, expires_on, reminder_days, notes, created_at",
      )
      .eq("boat_id", boatId)
      .order("created_at", { ascending: false }),
    "את המסמכים",
  );

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    filePath: row.file_path,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    issuedOn: row.issued_on,
    expiresOn: row.expires_on,
    reminderDays: row.reminder_days,
    notes: row.notes,
    createdAt: row.created_at,
  }));
});

export type CalendarItem = {
  id: string;
  kind: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  amountAgorot: number | null;
};

/**
 * The unified feed: real events plus derived document expiries and pending
 * payment dates, straight from the v_calendar_items view.
 */
export const getCalendarItems = cache(
  async (boatId: string, fromISO?: string, toISO?: string): Promise<CalendarItem[]> => {
    const supabase = await createClient();
    let query = supabase
      .from("v_calendar_items")
      .select("id, kind, title, starts_at, ends_at, all_day, location, amount_agorot")
      .eq("boat_id", boatId);

    if (fromISO) query = query.gte("starts_at", fromISO);
    if (toISO) query = query.lte("starts_at", toISO);

    const data = rows(await query.order("starts_at"), "את לוח הזמנים");

    return data.map((row) => ({
      id: row.id as string,
      kind: row.kind as string,
      title: row.title as string,
      startsAt: row.starts_at as string,
      endsAt: row.ends_at as string | null,
      allDay: row.all_day as boolean,
      location: row.location as string | null,
      amountAgorot: row.amount_agorot as number | null,
    }));
  },
);

export const getNextEvent = cache(async (boatId: string): Promise<CalendarItem | null> => {
  const items = await getCalendarItems(boatId, new Date().toISOString());
  return items.find((item) => item.kind === "usage") ?? items[0] ?? null;
});

/* -------------------------------------------------------------------------- */
/* Attendance — "who is coming to the boat, and when?"                        */
/* -------------------------------------------------------------------------- */

/**
 * Attendance rides on `events` with `kind = 'arrival'`; see lib/attendance.ts
 * for why there is no separate table. Read over a date *range* in Israel time,
 * because the strip is keyed by local calendar days and a UTC-shaped window
 * would drop an 08:00 stay on the first day of it.
 */
export const getAttendance = cache(
  async (boatId: string, fromKey: string, toKey: string): Promise<Attendance[]> => {
    const supabase = await createClient();
    const from = dayRange(fromKey).from;
    const to = dayRange(toKey).to;

    const data = rows(
      await supabase
        .from("events")
        .select("id, user_id, starts_at, ends_at, notes")
        .eq("boat_id", boatId)
        .eq("kind", "arrival")
        .not("user_id", "is", null)
        .gte("starts_at", from)
        .lt("starts_at", to)
        .order("starts_at"),
      "את ההגעות",
    );

    return data.map((row) => ({
      eventId: row.id,
      userId: row.user_id as string,
      dateKey: zonedDateKey(row.starts_at),
      // `notes` carries the exact segments when the row was written by the
      // attendance flow; without one the two ends are read instead, which is
      // what keeps rows from before segments existed readable.
      segments: segmentsOf(row.starts_at, row.ends_at, row.notes),
    }));
  },
);

/* -------------------------------------------------------------------------- */
/* Shared checklist                                                           */
/* -------------------------------------------------------------------------- */

export type TaskRow = {
  id: string;
  title: string;
  done: boolean;
};

/**
 * The boat's shared checklist — one list, every partner, nothing else.
 *
 * It reads the `tasks` table, which already had exactly these three columns
 * doing nothing with them: `due_on` and `assigned_to` are left untouched and
 * unexposed on purpose. This is a Google Keep list, not a task manager.
 *
 * Open items first, then the done ones, newest last within each group, so a
 * tick moves a row down rather than making it vanish — which is what lets it
 * be un-ticked.
 */
export const getChecklist = cache(async (boatId: string): Promise<TaskRow[]> => {
  const supabase = await createClient();
  const data = rows(
    await supabase
      .from("tasks")
      .select("id, title, done, created_at")
      .eq("boat_id", boatId)
      .order("done")
      .order("created_at"),
    "את הרשימה המשותפת",
  );

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    done: row.done,
  }));
});

/** Newest first. The cap is a sanity bound, not a page — the gallery shows all. */
export const getMedia = cache(async (boatId: string, limit = 60) => {
  const supabase = await createClient();
  return rows(
    await supabase
      .from("media")
      .select("id, path, caption")
      .eq("boat_id", boatId)
      .order("created_at", { ascending: false })
      .limit(limit),
    "את התמונות",
  );
});

/**
 * Every photo of the boat, hero first, for the full-screen viewer.
 *
 * URLs are signed in one batch rather than one call per photo: `createSignedUrl`
 * is a network round trip each, and a gallery is the one place where that
 * multiplies. A photo whose URL fails to sign is dropped rather than rendered
 * as a broken frame.
 */
export const getGalleryPhotos = cache(
  async (boatId: string, heroPath: string | null): Promise<GalleryPhoto[]> => {
    const media = await getMedia(boatId);

    // The hero is usually also a media row (promoted from the gallery); when it
    // is, it must appear once, not twice.
    const heroInMedia = media.some((item) => item.path === heroPath);
    const paths = [
      ...(heroPath && !heroInMedia ? [heroPath] : []),
      ...media.map((item) => item.path),
    ];
    if (paths.length === 0) return [];

    const urls = await getSignedUrls(BUCKETS.media, paths);

    const photos: GalleryPhoto[] = [];

    if (heroPath && !heroInMedia && urls[heroPath]) {
      photos.push({
        id: HERO_PHOTO_ID,
        path: heroPath,
        url: urls[heroPath],
        caption: null,
        isHero: true,
      });
    }

    for (const item of media) {
      const url = urls[item.path];
      if (!url) continue;
      photos.push({
        id: item.id,
        path: item.path,
        url,
        caption: item.caption,
        isHero: item.path === heroPath,
      });
    }

    // Whichever row is the hero leads, so tapping the big photo opens on it.
    return photos.sort((a, b) => Number(b.isHero) - Number(a.isHero));
  },
);

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * Signing deliberately does NOT throw the way the reads above do. A path that
 * fails to sign costs a thumbnail, not the truth about money — a missing photo
 * is self-evidently missing, whereas an empty expense list is a lie. Degrading
 * here and throwing there is the intended asymmetry, not an oversight.
 */

/** Buckets are private, so files are always served via short-lived signed URLs. */
export async function getSignedUrl(
  bucket: string,
  path: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

/**
 * The same, for a list — one request instead of one per path. Returns a
 * path → URL map; paths that failed to sign are simply absent.
 */
export async function getSignedUrls(
  bucket: string,
  paths: string[],
  expiresIn = 3600,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, expiresIn);

  const urls: Record<string, string> = {};
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) urls[entry.path] = entry.signedUrl;
  }
  return urls;
}
