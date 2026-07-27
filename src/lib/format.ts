/**
 * Hebrew/ILS formatting helpers.
 *
 * Every value that comes back from here is meant to be rendered inside an
 * element carrying the `.numeric` class, which isolates it as LTR so digits
 * and the ₪ sign do not get reordered by the surrounding RTL text.
 */

const AGOROT_PER_SHEKEL = 100;

const shekelFormatter = new Intl.NumberFormat("he-IL", {
  maximumFractionDigits: 0,
});

const shekelWithAgorotFormatter = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ‎240000 → "₪2,400"  (agorot are dropped unless they are non-zero) */
export function formatAgorot(agorot: number): string {
  const shekels = agorot / AGOROT_PER_SHEKEL;
  const hasAgorot = agorot % AGOROT_PER_SHEKEL !== 0;
  const sign = shekels < 0 ? "-" : "";
  const body = hasAgorot
    ? shekelWithAgorotFormatter.format(Math.abs(shekels))
    : shekelFormatter.format(Math.abs(shekels));
  return `${sign}₪${body}`;
}

/** Same, but never shows a minus sign — for "X owes Y ₪1,240" phrasing. */
export function formatAgorotAbs(agorot: number): string {
  return formatAgorot(Math.abs(agorot));
}

/** "2400" or "2400.50" (user input) → 240000 agorot. Returns null if unparseable. */
export function parseShekelInput(value: string): number | null {
  const cleaned = value.replace(/[₪,\s]/g, "").trim();
  if (cleaned === "") return null;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * AGOROT_PER_SHEKEL);
}

export function agorotToShekelInput(agorot: number): string {
  return agorot % AGOROT_PER_SHEKEL === 0
    ? String(agorot / AGOROT_PER_SHEKEL)
    : (agorot / AGOROT_PER_SHEKEL).toFixed(2);
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

const shortDate = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

const dayMonth = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
});

const longDate = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const timeOnly = new Intl.DateTimeFormat("he-IL", {
  hour: "2-digit",
  minute: "2-digit",
});

const monthYear = new Intl.DateTimeFormat("he-IL", {
  month: "long",
  year: "numeric",
});

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Postgres `date` columns arrive as "2026-07-01". `new Date()` parses that as
 * UTC midnight, which renders as the *previous day* for anyone west of UTC —
 * and this app has a partner who flies in from abroad. Date-only strings are
 * therefore parsed as local midnight; timestamps are left alone.
 */
export const toDate = (value: string | Date): Date => {
  if (value instanceof Date) return value;

  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
  }

  return new Date(value);
};

/** 17.05.25 */
export const formatShortDate = (v: string | Date) => shortDate.format(toDate(v));
/** 24 במאי */
export const formatDayMonth = (v: string | Date) => dayMonth.format(toDate(v));
/** יום שבת, 24 במאי 2025 */
export const formatLongDate = (v: string | Date) => longDate.format(toDate(v));
/** 08:00 */
export const formatTime = (v: string | Date) => timeOnly.format(toDate(v));
/** מאי 2025 */
export const formatMonthYear = (v: string | Date) => monthYear.format(toDate(v));

/** "18.6.25 - 02.7.25" style range used for partner arrivals. */
export function formatDateRange(from: string | Date, to?: string | Date | null) {
  if (!to) return formatShortDate(from);
  return `${formatShortDate(from)} - ${formatShortDate(to)}`;
}

/** Whole days from today; negative means the date has passed. */
export function daysUntil(value: string | Date, now: Date = new Date()): number {
  const target = toDate(value);
  const a = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86_400_000);
}

/**
 * "בעוד 12 ימים" / "היום" / "לפני 3 ימים" — the phrasing used on expiry chips
 * and upcoming-payment rows.
 */
export function formatRelativeDays(
  value: string | Date,
  now: Date = new Date(),
): string {
  const days = daysUntil(value, now);
  if (days === 0) return "היום";
  if (days === 1) return "מחר";
  if (days === -1) return "אתמול";
  if (days > 0) return `בעוד ${days} ימים`;
  return `לפני ${Math.abs(days)} ימים`;
}

/** Expiry state used to colour document badges. */
export type ExpiryState = "valid" | "soon" | "expired";

export function expiryState(
  expiresOn: string | Date | null | undefined,
  reminderDays = 30,
  now: Date = new Date(),
): ExpiryState | null {
  if (!expiresOn) return null;
  const days = daysUntil(expiresOn, now);
  if (days < 0) return "expired";
  if (days <= reminderDays) return "soon";
  return "valid";
}

export function expiryLabel(
  expiresOn: string | Date | null | undefined,
  reminderDays = 30,
  now: Date = new Date(),
): string | null {
  const state = expiryState(expiresOn, reminderDays, now);
  if (!state) return null;
  if (state === "valid") return "בתוקף";
  if (state === "expired") return `פג תוקף ${formatRelativeDays(expiresOn!, now)}`;
  return `תפוגה ${formatRelativeDays(expiresOn!, now)}`;
}

/** Bytes → "2.4 MB" */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** ISO yyyy-mm-dd in local time — what Postgres `date` columns expect. */
export function toDateInput(value: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}
