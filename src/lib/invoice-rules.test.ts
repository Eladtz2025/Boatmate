import { describe, expect, it } from "vitest";
import type { ParsedInvoice } from "./invoice-one";
import { decideInvoiceExpense, normaliseName, type CrewMember } from "./invoice-rules";

/**
 * The rule that decides who pays and how much.
 *
 * The asymmetry under test — Nir at the net figure, Elad at the full total — is
 * the single place where a mistake would be both silent and expensive: the
 * expense would look ordinary and the balance between two people would simply
 * be wrong by the VAT. So both directions are pinned, and so is every way the
 * decision is allowed to decline.
 */

const CREW: CrewMember[] = [
  { userId: "user-elad", name: "אלעד" },
  { userId: "user-nir", name: "ניר" },
];

function invoice(overrides: Partial<ParsedInvoice> = {}): ParsedInvoice {
  return {
    ok: true,
    customerName: "ניר כהן",
    invoiceNumber: "2026-0187",
    invoiceDate: "2026-05-14",
    netAgorot: 120000,
    totalAgorot: 141600,
    vatAgorot: 21600,
    ...overrides,
  };
}

describe("normaliseName", () => {
  it("folds case, quotes and punctuation", () => {
    expect(normaliseName("Nir")).toBe("nir");
    expect(normaliseName('ניר כהן בע"מ')).toBe("ניר כהן בעמ");
    expect(normaliseName("  אלעד   צברי  ")).toBe("אלעד צברי");
  });

  it("strips the bidi marks a copied name carries", () => {
    expect(normaliseName("‏ניר‎")).toBe("ניר");
  });
});

describe("decideInvoiceExpense", () => {
  it("bills Nir at the amount before VAT", () => {
    const decision = decideInvoiceExpense(invoice({ customerName: "ניר כהן" }), CREW);
    expect(decision).toMatchObject({
      ok: true,
      userId: "user-nir",
      basis: "net",
      amountAgorot: 120000,
    });
  });

  it("bills Elad at the full total including VAT", () => {
    const decision = decideInvoiceExpense(invoice({ customerName: "אלעד צברי" }), CREW);
    expect(decision).toMatchObject({
      ok: true,
      userId: "user-elad",
      basis: "total",
      amountAgorot: 141600,
    });
  });

  it("matches a name written in Latin letters", () => {
    expect(decideInvoiceExpense(invoice({ customerName: "Nir Cohen" }), CREW)).toMatchObject({
      ok: true,
      userId: "user-nir",
      basis: "net",
    });
  });

  it("reads the addressee, never the mail account", () => {
    // The whole point: one mailbox receives invoices made out to both partners,
    // so the document decides and the recipient is not consulted at all.
    const forNir = decideInvoiceExpense(invoice({ customerName: "ניר" }), CREW);
    const forElad = decideInvoiceExpense(invoice({ customerName: "אלעד" }), CREW);
    expect(forNir.ok && forNir.userId).toBe("user-nir");
    expect(forElad.ok && forElad.userId).toBe("user-elad");
  });

  /* ---------------------------------------------------------------------- */
  /* Refusals                                                                */
  /* ---------------------------------------------------------------------- */

  it("refuses a customer who is not a partner", () => {
    const decision = decideInvoiceExpense(invoice({ customerName: "יוסי לוי" }), CREW);
    expect(decision.ok).toBe(false);
    expect(!decision.ok && decision.reason).toContain("לא זוהה שותף");
  });

  it("refuses a name that mentions both partners", () => {
    const decision = decideInvoiceExpense(
      invoice({ customerName: "ניר ואלעד" }),
      CREW,
    );
    expect(decision.ok).toBe(false);
  });

  it("refuses when no crew member carries that name", () => {
    // The rule knows about Nir; this boat does not have one.
    const decision = decideInvoiceExpense(invoice({ customerName: "ניר" }), [
      { userId: "user-elad", name: "אלעד" },
    ]);
    expect(decision.ok).toBe(false);
    expect(!decision.ok && decision.reason).toContain("אין שותף");
  });

  it("refuses when two crew members would match", () => {
    const decision = decideInvoiceExpense(invoice({ customerName: "ניר" }), [
      { userId: "a", name: "ניר כהן" },
      { userId: "b", name: "ניר לוי" },
    ]);
    expect(decision.ok).toBe(false);
  });

  it("refuses an empty customer name", () => {
    expect(decideInvoiceExpense(invoice({ customerName: "   " }), CREW).ok).toBe(false);
  });

  it("does not match a name as a fragment of another word", () => {
    // "נירית" is not "ניר", and a substring match would have billed her to him.
    expect(decideInvoiceExpense(invoice({ customerName: "נירית שרון" }), CREW).ok).toBe(
      false,
    );
  });

  it("refuses a non-positive amount", () => {
    const decision = decideInvoiceExpense(
      invoice({ customerName: "ניר", netAgorot: 0 }),
      CREW,
    );
    expect(decision.ok).toBe(false);
  });

  it("uses the crew's own spelling for the expense description", () => {
    const decision = decideInvoiceExpense(invoice({ customerName: "NIR COHEN" }), CREW);
    expect(decision.ok && decision.partnerName).toBe("ניר");
  });
});

describe("Hebrew conjunction prefixes", () => {
  const CREW_BOTH: CrewMember[] = CREW;

  it("sees a partner named with a bound ו־ prefix", () => {
    // "ניר ואלעד" — the second name carries the conjunction, and missing it
    // would have quietly billed the whole invoice to the first partner.
    const decision = decideInvoiceExpense(
      invoice({ customerName: "ניר ואלעד" }),
      CREW_BOTH,
    );
    expect(decision.ok).toBe(false);
    expect(!decision.ok && decision.reason).toContain("יותר משותף אחד");
  });

  it("still matches a single partner written with a prefix", () => {
    const decision = decideInvoiceExpense(
      invoice({ customerName: "לאלעד צברי" }),
      CREW_BOTH,
    );
    expect(decision).toMatchObject({ ok: true, userId: "user-elad", basis: "total" });
  });

  it("does not turn a prefix into a licence to match fragments", () => {
    expect(decideInvoiceExpense(invoice({ customerName: "ונירית" }), CREW_BOTH).ok).toBe(
      false,
    );
  });
});
