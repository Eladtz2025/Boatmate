import type { ParsedInvoice } from "./invoice-one";

/**
 * Turning a parsed invoice into "who pays, and how much".
 *
 * Pure, so the rule that decides real money is testable without a mailbox.
 *
 * Two decisions live here and both are allowed to say "I don't know":
 *
 *  - **Who.** The addressee printed on the document, matched against the boat's
 *    own crew list. Never the mail recipient and never the sender — the whole
 *    point is that one mailbox receives invoices made out to different people.
 *  - **How much.** Nir's invoices are entered net of VAT, Elad's at the full
 *    total. That asymmetry is a fact about how the two of them account for the
 *    boat, not something derivable from the document, so it is written down.
 *
 * The crew are matched by *name*, resolved against `boat_members` at run time.
 * No database id appears in this file: a partner who is renamed or replaced is
 * a data change, and hardcoding a UUID here would make it a code change.
 */

/** Which figure on the invoice becomes the expense. */
export type AmountBasis = "net" | "total";

type PartnerRule = {
  /** Every spelling of the name that might be printed on an invoice. */
  aliases: readonly string[];
  basis: AmountBasis;
};

export const PARTNER_RULES: readonly PartnerRule[] = [
  // Nir is invoiced through a business and reclaims the VAT, so the boat's
  // share is the figure before it.
  { aliases: ["ניר", "nir"], basis: "net" },
  // Elad pays the invoice as it stands.
  { aliases: ["אלעד", "elad"], basis: "total" },
];

/**
 * Fold away everything that varies between how a name is typed on an invoice
 * and how it is stored in the crew list: case, Hebrew niqqud, the geresh and
 * gershayim used in abbreviations, punctuation, and runs of whitespace.
 */
export function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[\u05F3\u05F4'"`]/g, "")
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The one-letter prefixes Hebrew attaches to a name instead of spacing it off:
 * ו־ "and", ה־ "the", ל־ "to", ב־ "in", מ־ "from", ש־ "that", כ־ "as".
 *
 * Without these, "ניר ואלעד" reads as the two words "ניר" and "ואלעד", only the
 * first of which is a name we know — so an invoice made out to both partners
 * would be billed entirely to Nir, at the net figure, silently. That is the
 * exact shape of mistake this module exists to refuse, and it was a real one:
 * a test caught it here rather than a balance catching it later.
 */
const HEBREW_PREFIXES = ["ו", "ה", "ל", "ב", "מ", "ש", "כ", "ול", "וה"];

/** Is `word` this alias, with or without a bound prefix? */
function isAlias(word: string, alias: string): boolean {
  if (word === alias) return true;
  return HEBREW_PREFIXES.some((prefix) => word === `${prefix}${alias}`);
}

/**
 * Does `haystack` contain `needle` as a whole word rather than a fragment?
 *
 * Whole words only, so "נירית" is not "ניר" — a substring match would have
 * billed one person's invoice to another.
 */
function containsWord(haystack: string, needle: string): boolean {
  if (haystack === needle) return true;
  return haystack.split(" ").some((word) => isAlias(word, needle));
}

export type CrewMember = { userId: string; name: string };

export type InvoiceDecision =
  | {
      ok: true;
      userId: string;
      /** The crew name matched, for the expense description. */
      partnerName: string;
      basis: AmountBasis;
      amountAgorot: number;
    }
  | { ok: false; reason: string };

/**
 * Decide who an invoice belongs to and what it is worth to the boat.
 *
 * Refuses — rather than picking — whenever the answer is not singular:
 * a customer matching neither partner, a customer somehow matching both, or a
 * partner with no corresponding crew member. Each of those would otherwise
 * move money between two people on a guess.
 */
export function decideInvoiceExpense(
  invoice: ParsedInvoice,
  crew: readonly CrewMember[],
): InvoiceDecision {
  const customer = normaliseName(invoice.customerName);
  if (!customer) return { ok: false, reason: "שם הלקוח בחשבונית ריק" };

  const matched = PARTNER_RULES.filter((rule) =>
    rule.aliases.some((alias) => containsWord(customer, normaliseName(alias))),
  );

  if (matched.length === 0) {
    return {
      ok: false,
      reason: `לא זוהה שותף מתוך שם הלקוח "${invoice.customerName}"`,
    };
  }
  if (matched.length > 1) {
    return {
      ok: false,
      reason: `שם הלקוח "${invoice.customerName}" מתאים ליותר משותף אחד`,
    };
  }

  const rule = matched[0];

  // Now the same aliases have to land on exactly one real crew member. A boat
  // with two partners called Nir is not a case to resolve by picking the first.
  const people = crew.filter((member) =>
    rule.aliases.some((alias) => containsWord(normaliseName(member.name), normaliseName(alias))),
  );

  if (people.length === 0) {
    return {
      ok: false,
      reason: `אין שותף בסירה בשם "${invoice.customerName}"`,
    };
  }
  if (people.length > 1) {
    return {
      ok: false,
      reason: `יותר משותף אחד בסירה מתאים לשם "${invoice.customerName}"`,
    };
  }

  const amountAgorot =
    rule.basis === "net" ? invoice.netAgorot : invoice.totalAgorot;

  if (!Number.isInteger(amountAgorot) || amountAgorot <= 0) {
    return { ok: false, reason: "סכום החשבונית אינו תקין" };
  }

  return {
    ok: true,
    userId: people[0].userId,
    partnerName: people[0].name,
    basis: rule.basis,
    amountAgorot,
  };
}
