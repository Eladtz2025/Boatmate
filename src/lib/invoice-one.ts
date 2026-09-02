/**
 * Reading an Invoice One document.
 *
 * Pure and dependency-free, so every rule here is unit-testable without a
 * network, a mailbox or a database. Nothing in this file talks to Gmail; it is
 * handed HTML and returns either a fully-formed invoice or a refusal.
 *
 * **The refusal is the important half.** These invoices become expenses with no
 * approval step, against real money split between partners, so a parser that
 * guesses is worse than one that gives up. Every extraction below is anchored
 * on a Hebrew label rather than on position, and the result is checked against
 * itself — net plus VAT must equal the total — before anything is returned. A
 * mis-read that happens to satisfy that arithmetic is possible but vanishingly
 * unlikely; a mis-read that does not is caught here rather than in a balance.
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
  /** ISO "2026-05-14", or null when the document does not print one. */
  invoiceDate: string | null;
  /** Integer agorot, both. Net is before VAT, total is after it. */
  netAgorot: number;
  totalAgorot: number;
  vatAgorot: number;
};

export type InvoiceParseResult = ParsedInvoice | InvoiceParseFailure;

const fail = (reason: string): InvoiceParseFailure => ({ ok: false, reason });

/* -------------------------------------------------------------------------- */
/* HTML → text                                                                */
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

/**
 * Flatten a document to labelled lines.
 *
 * Block boundaries become newlines and every other tag becomes a single space,
 * because these documents lay a label and its value out as adjacent cells: the
 * words have to stay next to each other on one line for a label-anchored match
 * to reach the value, while unrelated rows must not run together.
 */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|table|h[1-6]|li|section|header|footer)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    // Bidi and zero-width marks travel with copy-pasted Hebrew and would
    // otherwise sit inside a number or between a label and its colon.
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* The link out of the email                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Hosts an invoice link is allowed to point at.
 *
 * A allowlist rather than "whatever the first link is": the sync follows this
 * URL server-side, from inside our own network, so an arbitrary link in an
 * email body must not be able to steer it. `invoice-one.com` is the sending
 * domain; `invoice-one.co.il` is the product's own site; `menahel4u.com` is the
 * vendor that operates it and is where documents have historically been served.
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

/** The anchor text that carries the document link, and its common variants. */
const VIEW_LINK_TEXT = /לצפי|לצפייה|למסמך|לחץ\s*כאן|לחצו\s*כאן|הצג/;

/**
 * The Invoice One viewer URL inside an email body.
 *
 * Preference order, most specific first: an anchor whose *text* is the Hebrew
 * "click here to view the document", then any anchor pointing at an allowed
 * host. Anything pointing elsewhere is ignored outright — see ALLOWED_HOSTS.
 */
export function extractViewerUrl(html: string): string | null {
  const anchors = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];

  const candidates = anchors
    .map((match) => ({
      href: decodeEntities(match[1]).trim(),
      text: htmlToText(match[2]),
    }))
    .filter((anchor) => isAllowedInvoiceHost(anchor.href));

  if (candidates.length === 0) return null;

  const labelled = candidates.find((anchor) => VIEW_LINK_TEXT.test(anchor.text));
  return (labelled ?? candidates[0]).href;
}

/* -------------------------------------------------------------------------- */
/* Money                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * "1,234.56", "₪ 1,234.56", "1234" → agorot.
 *
 * Deliberately strict about the decimal: Israeli documents use a full stop for
 * agorot and a comma for thousands, and treating a comma as a decimal point
 * would turn ₪1,234 into ₪1.23. Rounded, never truncated, and returned as an
 * integer because that is the only money this app stores.
 */
export function parseShekels(raw: string): number | null {
  const cleaned = raw
    .replace(/[₪\s]/g, "")
    .replace(/[^\d.,-]/g, "")
    .replace(/,/g, "");

  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

type LineOptions = {
  /**
   * Which occurrence wins. Money is read `last`, because summary rows sit at
   * the foot of a document and a total there outranks a line item above it;
   * identifying fields are read `first`, because the addressee and the invoice
   * number are printed in the header and a later "תאריך לתשלום" must not
   * displace the issue date.
   */
  from?: "first" | "last";
  /**
   * Labels that disqualify a line. Hebrew invoice labels nest — "סה״כ כולל
   * מע״מ" and "סה״כ לפני מע״מ" both contain "מע״מ" — so without this the VAT
   * lookup lands on the total row and the three numbers stop agreeing.
   */
  exclude?: RegExp[];
};

/** The line a label appears on, or null. */
function findLine(
  text: string,
  label: RegExp,
  { from = "first", exclude = [] }: LineOptions = {},
): string | null {
  const lines = text
    .split("\n")
    .filter((line) => label.test(line) && !exclude.some((other) => other.test(line)));

  if (lines.length === 0) return null;
  return from === "last" ? lines[lines.length - 1] : lines[0];
}

/** The first amount on the same line as a label, reading past a colon. */
function amountAfter(
  text: string,
  label: RegExp,
  options: LineOptions = {},
): number | null {
  const line = findLine(text, label, { from: "last", ...options });
  if (line === null) return null;

  // Everything after the label on that line, then the first money-shaped run.
  const at = line.search(label);
  const matched = line.slice(at).match(label);
  if (!matched) return null;

  const rest = line.slice(at + matched[0].length);
  const amount = rest.match(/-?\d[\d,]*(?:\.\d{1,2})?/);
  return amount ? parseShekels(amount[0]) : null;
}

/** The text following a label on its line — for names and numbers, not money. */
function valueAfter(
  text: string,
  label: RegExp,
  options: LineOptions = {},
): string | null {
  const line = findLine(text, label, options);
  if (line === null) return null;

  const at = line.search(label);
  const matched = line.slice(at).match(label);
  if (!matched) return null;

  return (
    line
      .slice(at + matched[0].length)
      .replace(/^[\s:\uFF1A\-\u2013]+/, "")
      .trim() || null
  );
}

/* -------------------------------------------------------------------------- */
/* Field labels                                                               */
/* -------------------------------------------------------------------------- */

/*
 * Every pattern is a label as it is printed on the document, and each field
 * lists its variants because these documents are not consistent between
 * templates. Adding a variant is the intended way to teach the parser a new
 * layout — the extraction logic itself should not need to change.
 */

const LABEL = {
  customer: /(?:לכבוד|שם\s*הלקוח|לקוח|שם\s*המזמין|עבור)\s*:?/,
  invoiceNumber:
    /(?:חשבונית\s*מס(?:פר)?|מספר\s*חשבונית|חשבונית\s*מס['׳]?|מס['׳]?\s*חשבונית|אסמכתא)\s*:?\s*#?/,
  invoiceDate: /(?:תאריך\s*הפקה|תאריך\s*החשבונית|תאריך)\s*:?/,
  net: /(?:סה["״']?כ\s*לפני\s*מע["״']?מ|סכום\s*לפני\s*מע["״']?מ|לפני\s*מע["״']?מ|סכום\s*חייב\s*במע["״']?מ|סה["״']?כ\s*חייב)\s*:?/,
  vat: /(?:סכום\s*מע["״']?מ|מע["״']?מ(?:\s*\d{1,2}(?:\.\d+)?\s*%)?)\s*:?/,
  total:
    /(?:סה["״']?כ\s*לתשלום|סה["״']?כ\s*כולל\s*מע["״']?מ|סך\s*הכל\s*לתשלום|לתשלום|סה["״']?כ\s*כולל)\s*:?/,
} as const;

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * "14/05/2026", "14.5.26", "2026-05-14" → "2026-05-14".
 *
 * Day-first, because that is how a date is written in Israel and reading
 * 05/06 as the 6th of May rather than the 5th of June would put an expense in
 * the wrong month. Ambiguity is not resolvable from the string alone, so the
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
/* The parse                                                                  */
/* -------------------------------------------------------------------------- */

/** Widest VAT rate this will accept as plausible. Israel is 18%; the band
 *  leaves room for the 17% era and for a future change without a code edit. */
const VAT_BAND = { min: 0.12, max: 0.22 } as const;

/** Agorot of slack allowed when checking net + VAT against the printed total. */
const ROUNDING_SLACK = 2;

/**
 * Read a document. Returns a refusal rather than a partial answer.
 *
 * The self-check at the end is what makes this safe to run unattended: three
 * numbers are extracted independently by label, and they must agree with each
 * other. A parser that latched onto a line item instead of a summary row, or
 * onto a quantity instead of a price, will almost never produce three numbers
 * that add up — so it stops here instead of creating an expense.
 */
export function parseInvoiceDocument(html: string): InvoiceParseResult {
  const text = htmlToText(html);
  if (text.length < 40) return fail("מסמך החשבונית ריק או לא נטען");

  const customerName = valueAfter(text, LABEL.customer);
  if (!customerName) return fail("לא נמצא שם הלקוח בחשבונית");

  const invoiceNumberRaw = valueAfter(text, LABEL.invoiceNumber);
  const invoiceNumber = invoiceNumberRaw?.match(/[\w\-/]+/)?.[0] ?? null;
  if (!invoiceNumber) return fail("לא נמצא מספר החשבונית");

  const dateRaw = valueAfter(text, LABEL.invoiceDate);
  const invoiceDate = dateRaw ? parseInvoiceDate(dateRaw) : null;

  // Order matters only through `exclude`: "מע״מ" is a substring of both the
  // net and the total labels, so the VAT lookup has to be told to skip those
  // rows or it reads the total and then reports the document as inconsistent.
  const netAgorot = amountAfter(text, LABEL.net, { exclude: [LABEL.total] });
  const totalAgorot = amountAfter(text, LABEL.total);
  const vatFound = amountAfter(text, LABEL.vat, {
    exclude: [LABEL.total, LABEL.net],
  });

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
  // total picked up from the wrong row: two unrelated numbers rarely sit at a
  // plausible tax rate from one another.
  const impliedRate = vatAgorot / netAgorot;
  if (impliedRate < VAT_BAND.min || impliedRate > VAT_BAND.max) {
    return fail("היחס בין הסכומים אינו תואם מע״מ מוכר");
  }

  return {
    ok: true,
    customerName: customerName.replace(/\s+/g, " ").trim(),
    invoiceNumber,
    invoiceDate,
    netAgorot,
    totalAgorot,
    vatAgorot,
  };
}
