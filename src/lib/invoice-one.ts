/**
 * Reading an Invoice One document.
 *
 * Pure and dependency-free, so every rule here is unit-testable without a
 * network, a mailbox or a database. Nothing in this file fetches anything; it
 * is handed the pieces and returns either a fully-formed invoice or a refusal.
 *
 * **Where the invoice actually lives.** The first version of this looked for
 * the invoice in the HTML behind the "לחץ כאן לצפיה במסמך" link, and skipped
 * every message with "לא נמצא שם הלקוח בחשבונית". It was right to refuse: that
 * URL returns a 1.8KB Angular shell — `<m4u-app-root>` and a loading spinner —
 * with no invoice content in it at all. The real chain is
 *
 *     email  →  /viewernew/pages/Y_GreeViewer_document/<DocumentID>
 *            →  /ViewerNew/api/GreeViewer/Document/GetPDF?DocumentID=…
 *            →  JSON { Entity: { ArrData: <base64 PDF>, FileName } }
 *            →  a PDF with a real text layer
 *
 * so the document is a **PDF**, and it is read by position rather than as
 * flowing text. Each label sits on the same visual row as its value with the
 * value to its *left*, Hebrew being right-to-left; flattening the page to lines
 * separates them, which is what made the summary block unreadable.
 *
 * **The refusal is still the important half.** These invoices become expenses
 * with no approval step, so a parser that guesses is worse than one that gives
 * up. Every field is anchored on a Hebrew label, and the result is checked
 * against itself — net plus VAT must equal the total — before anything is
 * returned.
 */

export type InvoiceParseFailure = {
  ok: false;
  /** Hebrew, shown to a partner. Says which field could not be trusted. */
  reason: string;
};

export type ParsedInvoice = {
  ok: true;
  /** The addressee printed on the document — never the mail recipient. */
  customerName: string;
  invoiceNumber: string;
  /** ISO "2026-09-01", or null when the document does not print one. */
  invoiceDate: string | null;
  /** Integer agorot, both. Net is before VAT, total is after it. */
  netAgorot: number;
  totalAgorot: number;
  vatAgorot: number;
};

export type InvoiceParseResult = ParsedInvoice | InvoiceParseFailure;

const fail = (reason: string): InvoiceParseFailure => ({ ok: false, reason });

/** Bidi and zero-width marks travel with Hebrew and sit inside numbers. */
const INVISIBLE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]/g;

const clean = (value: string): string =>
  value.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();

/* -------------------------------------------------------------------------- */
/* The link out of the email                                                  */
/* -------------------------------------------------------------------------- */

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  shekel: "₪",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+|#\d+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole);
}

/** Anchor text, flattened enough to test against. */
function anchorText(html: string): string {
  return clean(decodeEntities(html.replace(/<[^>]+>/g, " ")));
}

/**
 * Hosts an invoice link is allowed to point at.
 *
 * An allowlist rather than "whatever the first link is": the sync follows this
 * URL server-side, from inside our own network, so an arbitrary link in an
 * email body must not be able to steer it.
 */
const ALLOWED_HOSTS = [
  "invoice-one.com",
  "invoice-one.co.il",
  "menahel4u.com",
] as const;

export function isAllowedInvoiceHost(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:" && protocol !== "http:") return false;
    const host = hostname.toLowerCase();
    return ALLOWED_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}

/**
 * A real Invoice One document link, which is the only one worth following.
 *
 * Anchored on the path the viewer actually uses rather than on the anchor
 * text: the same email carries three other "לחץ כאן" links on allowed hosts —
 * technical help, the vendor's home page and an unsubscribe — and picking by
 * wording alone put those within one ordering change of being followed. The
 * unsubscribe link is the one that makes this worth being strict about: it
 * differs from the document link only in the path.
 */
const VIEWER_PATH = /\/viewernew\/pages\/[^/]*viewer[^/]*document\/([A-Za-z0-9_-]+)/i;

/** The DocumentID out of a viewer URL, which is what the API is keyed on. */
export function documentIdFromViewerUrl(url: string): string | null {
  try {
    return VIEWER_PATH.exec(new URL(url).pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function extractViewerUrl(html: string): string | null {
  const anchors = [
    ...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  ]
    .map((match) => ({
      href: decodeEntities(match[1]).trim(),
      text: anchorText(match[2]),
    }))
    .filter((anchor) => isAllowedInvoiceHost(anchor.href));

  // The document viewer path, and nothing else, is what gets followed.
  const viewer = anchors.find((anchor) => documentIdFromViewerUrl(anchor.href));
  return viewer?.href ?? null;
}

/* -------------------------------------------------------------------------- */
/* Money and dates                                                            */
/* -------------------------------------------------------------------------- */

/**
 * "₪ 2,128.72" → agorot.
 *
 * Deliberately strict about the decimal: Israeli documents use a full stop for
 * agorot and a comma for thousands, and treating a comma as a decimal point
 * would turn ₪1,234 into ₪1.23.
 */
export function parseShekels(raw: string): number | null {
  const cleaned = raw
    .replace(INVISIBLE, "")
    .replace(/[₪\s]/g, "")
    .replace(/[^\d.,-]/g, "")
    .replace(/,/g, "");

  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/**
 * "01/09/2026", "14.5.26", "2026-05-14" → "2026-05-14".
 *
 * Day-first, because that is how a date is written in Israel and reading 05/06
 * as the 6th of May rather than the 5th of June would put an expense in the
 * wrong month. Ambiguity is not resolvable from the string alone, so the
 * convention is fixed rather than sniffed.
 */
export function parseInvoiceDate(raw: string): string | null {
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!dmy) return null;

  const day = Number(dmy[1]);
  const month = Number(dmy[2]);
  const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);

  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  if (year < 2000 || year > 2100) return null;

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/* -------------------------------------------------------------------------- */
/* The page, as rows                                                          */
/* -------------------------------------------------------------------------- */

/** One run of text on the page, with the position the PDF gives it. */
export type PdfTextItem = { text: string; x: number; y: number };

/** Items sharing a visual row, ordered right-to-left as Hebrew is read. */
export type PdfRow = { y: number; items: PdfTextItem[] };

/**
 * How far apart two items may sit vertically and still be the same row.
 *
 * Measured, not guessed: on a real document the label "מע״מ 18%" sits at
 * y=442.0 and its amount at y=440.5, while the next row down is at 425.4. A
 * couple of points of slack covers the baseline differences within a row and
 * stays well clear of the gap between rows.
 */
export const ROW_TOLERANCE = 3;

/**
 * Group positioned text into rows, top of the page first.
 *
 * This is the whole reason the parser reads geometry instead of flowing text:
 * a PDF emits a table's cells in whatever order it likes, and flattening the
 * page put every label on one line and every value on another.
 */
export function groupRows(
  items: readonly PdfTextItem[],
  tolerance: number = ROW_TOLERANCE,
): PdfRow[] {
  const usable = items
    .map((item) => ({ ...item, text: clean(item.text) }))
    .filter((item) => item.text.length > 0)
    .sort((a, b) => b.y - a.y);

  const rows: PdfRow[] = [];

  for (const item of usable) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }

  // Right to left: the label is rightmost, its value sits to the left of it.
  for (const row of rows) row.items.sort((a, b) => b.x - a.x);
  return rows;
}

/* -------------------------------------------------------------------------- */
/* Field labels                                                               */
/* -------------------------------------------------------------------------- */

/*
 * Every pattern below is a label as it is actually printed on an Invoice One
 * document — confirmed against a real one, not imagined. Adding a variant is
 * the intended way to teach the parser a new template; the extraction itself
 * should not need to change.
 */
const LABEL = {
  customer: /(?:לכבוד|שם\s*הלקוח|לקוח|שם\s*המזמין|עבור)\s*:?\s*$/,
  invoiceNumber:
    /(?:חשבונית\s*מס(?:\s*קבלה)?|חשבונית\s*מספר|מספר\s*חשבונית|קבלה\s*מס|אסמכתא)\s*:?\s*$/,
  invoiceDate: /(?:תאריך\s*הפקה|תאריך\s*החשבונית|תאריך)\s*:?\s*$/,
  net: /(?:סה["״']?כ\s*חייב\s*מע["״']?מ|סה["״']?כ\s*לפני\s*מע["״']?מ|סכום\s*לפני\s*מע["״']?מ|לפני\s*מע["״']?מ|סה["״']?כ\s*חייב)\s*:?\s*$/,
  vat: /^(?:סכום\s*מע["״']?מ|מע["״']?מ)(?:\s*\d{1,2}(?:[.,]\d+)?\s*%)?\s*:?\s*$/,
  total:
    /(?:סה["״']?כ\s*לתשלום|סך\s*הכל\s*לתשלום|סה["״']?כ\s*כולל\s*מע["״']?מ|סה["״']?כ\s*כולל)\s*:?\s*$/,
} as const;

/*
 * Anchored with `$` on purpose. A label is a cell of its own, so it *ends*
 * where the cell ends — without the anchor "מע״מ" also matches the line item
 * "דמי עגינה … מע״מ" and "סה״כ חייב מע״מ" matches the VAT pattern, and the
 * three summary figures stop agreeing with each other.
 */

/* -------------------------------------------------------------------------- */
/* Reading a field                                                            */
/* -------------------------------------------------------------------------- */

type FieldOptions = {
  /** Money is read from the bottom of the page, where summaries live. */
  from?: "first" | "last";
  /** Labels that disqualify a row, for patterns that nest inside each other. */
  exclude?: RegExp[];
};

/**
 * How far to the left of a label its value may sit and still be *beside* it.
 *
 * Measured on a real document: the widest genuine gap is the date, whose label
 * sits at x=145.9 and whose value sits at x=23.5 — 122 points. The gap this
 * exists to reject is on the addressee row, where a note reading
 * "=== מסמך ממוחשב ===" sits 481 points to the left of "לכבוד:" and became the
 * customer name the moment the real one was missing. Without a limit, any
 * label whose cell is empty silently adopts whatever else is on its row.
 */
const MAX_LABEL_GAP = 220;

/** The text immediately to the left of a label — its value, in RTL. */
function valueBeside(
  rows: readonly PdfRow[],
  label: RegExp,
  { from = "first", exclude = [] }: FieldOptions = {},
): string | null {
  const matches: string[] = [];

  for (const row of rows) {
    const at = row.items.findIndex((item) => label.test(item.text));
    if (at === -1) continue;
    if (exclude.some((other) => row.items.some((item) => other.test(item.text)))) {
      continue;
    }

    // Items are sorted right-to-left, so the next one along is the one
    // immediately to the label's left — the cell the eye reads next.
    const anchor = row.items[at];
    const value = row.items[at + 1];
    if (!value) continue;
    if (anchor.x - value.x > MAX_LABEL_GAP) continue;

    matches.push(value.text);
  }

  if (matches.length === 0) return null;
  return from === "last" ? matches[matches.length - 1] : matches[0];
}

function amountBeside(
  rows: readonly PdfRow[],
  label: RegExp,
  options: FieldOptions = {},
): number | null {
  const raw = valueBeside(rows, label, { from: "last", ...options });
  return raw === null ? null : parseShekels(raw);
}

/* -------------------------------------------------------------------------- */
/* The parse                                                                  */
/* -------------------------------------------------------------------------- */

/** Widest VAT rate this will accept as plausible. Israel is 18%. */
const VAT_BAND = { min: 0.12, max: 0.22 } as const;

/** Agorot of slack allowed when checking net + VAT against the printed total. */
const ROUNDING_SLACK = 2;

/**
 * Read a document that has already been turned into positioned text.
 *
 * The self-check at the end is what makes this safe to run unattended: three
 * numbers are extracted independently by label, and they must agree with each
 * other. A parse that latched onto a line item instead of a summary row will
 * almost never produce three numbers that add up — so it stops here rather
 * than in somebody's balance.
 */
export function parseInvoiceItems(items: readonly PdfTextItem[]): InvoiceParseResult {
  const rows = groupRows(items);
  if (rows.length === 0) return fail("מסמך החשבונית ריק או לא נטען");

  const customerName = valueBeside(rows, LABEL.customer);
  if (!customerName) return fail("לא נמצא שם הלקוח בחשבונית");

  const numberRaw = valueBeside(rows, LABEL.invoiceNumber);
  const invoiceNumber = numberRaw?.match(/[\w\-/]+/)?.[0] ?? null;
  if (!invoiceNumber) return fail("לא נמצא מספר החשבונית");

  const dateRaw = valueBeside(rows, LABEL.invoiceDate);
  const invoiceDate = dateRaw ? parseInvoiceDate(dateRaw) : null;

  const netAgorot = amountBeside(rows, LABEL.net);
  const totalAgorot = amountBeside(rows, LABEL.total);
  const vatFound = amountBeside(rows, LABEL.vat);

  if (netAgorot === null) return fail("לא נמצא הסכום לפני מע״מ");
  if (totalAgorot === null) return fail("לא נמצא הסכום הכולל");

  if (netAgorot <= 0 || totalAgorot <= 0) {
    return fail("סכומי החשבונית אינם חיוביים");
  }
  if (totalAgorot < netAgorot) {
    return fail("הסכום הכולל קטן מהסכום לפני מע״מ");
  }

  const vatAgorot = totalAgorot - netAgorot;

  // When the document prints a VAT amount of its own, it must agree with the
  // difference. Disagreement means at least one of the three was misread.
  if (vatFound !== null && Math.abs(vatFound - vatAgorot) > ROUNDING_SLACK) {
    return fail("סכומי החשבונית אינם מסתדרים (מע״מ)");
  }

  // And the implied rate has to look like VAT at all. This is what catches a
  // total picked up from the wrong row.
  const impliedRate = vatAgorot / netAgorot;
  if (impliedRate < VAT_BAND.min || impliedRate > VAT_BAND.max) {
    return fail("היחס בין הסכומים אינו תואם מע״מ מוכר");
  }

  return {
    ok: true,
    customerName: clean(customerName),
    invoiceNumber,
    invoiceDate,
    netAgorot,
    totalAgorot,
    vatAgorot,
  };
}
