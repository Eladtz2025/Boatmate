import { describe, expect, it } from "vitest";
import {
  extractViewerUrl,
  htmlToText,
  isAllowedInvoiceHost,
  parseInvoiceDate,
  parseInvoiceDocument,
  parseShekels,
} from "./invoice-one";

/**
 * These invoices become expenses with no human in the loop, so the tests that
 * matter most are the ones asserting the parser **refuses**. A wrong number
 * here moves real money between two people quietly; a refusal costs a partner
 * one manual entry.
 *
 * The fixture below is written from the fields an Israeli tax invoice is
 * required to print rather than from a captured document — see the note in the
 * README section of this file's `describe("a document we have not seen")`.
 */

/** A plausible Invoice One document: header, line items, then a summary block. */
function invoiceHtml(overrides: Partial<Record<string, string>> = {}): string {
  const field = {
    customer: "ניר כהן",
    number: "2026-0187",
    date: "14/05/2026",
    net: "1,200.00",
    vat: "216.00",
    total: "1,416.00",
    ...overrides,
  };

  return `
    <html><body dir="rtl">
      <table>
        <tr><td>חשבונית מס</td><td>${field.number}</td></tr>
        <tr><td>תאריך</td><td>${field.date}</td></tr>
        <tr><td>לכבוד</td><td>${field.customer}</td></tr>
      </table>
      <table>
        <tr><td>אחסנת סירה</td><td>1</td><td>1,200.00</td></tr>
      </table>
      <table>
        <tr><td>סה"כ לפני מע"מ</td><td>${field.net}</td></tr>
        <tr><td>מע"מ 18%</td><td>${field.vat}</td></tr>
        <tr><td>סה"כ לתשלום</td><td>${field.total}</td></tr>
      </table>
    </body></html>`;
}

describe("htmlToText", () => {
  it("keeps a label and its value on one line", () => {
    // The whole label-anchored approach depends on this: cells of a row must
    // not be split apart, and separate rows must not be run together.
    const text = htmlToText("<tr><td>לכבוד</td><td>ניר</td></tr><tr><td>x</td></tr>");
    expect(text.split("\n")[0]).toBe("לכבוד ניר");
  });

  it("drops bidi marks that travel with copied Hebrew", () => {
    // A right-to-left mark between the label and the colon would break the
    // match, and one inside a number would break the parse.
    expect(htmlToText("<p>‏סה\"כ לתשלום‎: 1,416.00</p>")).toBe(
      'סה"כ לתשלום: 1,416.00',
    );
  });

  it("ignores script and style content", () => {
    expect(htmlToText("<style>.a{}</style><p>לכבוד ניר</p>")).toBe("לכבוד ניר");
  });

  it("decodes entities, including the shekel sign", () => {
    expect(htmlToText("<p>1,416.00&nbsp;&#8362;</p>")).toBe("1,416.00 ₪");
  });
});

describe("parseShekels", () => {
  it("reads Israeli formatting", () => {
    expect(parseShekels("1,416.00")).toBe(141600);
    expect(parseShekels("₪ 1,416.00")).toBe(141600);
    expect(parseShekels("1416")).toBe(141600);
    expect(parseShekels("0.50")).toBe(50);
  });

  it("treats a comma as a thousands separator, never a decimal point", () => {
    // The failure this guards is silent and large: ₪1,234 read as ₪1.23.
    expect(parseShekels("1,234")).toBe(123400);
  });

  it("refuses what is not a number", () => {
    expect(parseShekels("")).toBeNull();
    expect(parseShekels("—")).toBeNull();
    expect(parseShekels("1.2.3")).toBeNull();
  });
});

describe("parseInvoiceDate", () => {
  it("reads day-first, as Israeli documents are written", () => {
    expect(parseInvoiceDate("05/06/2026")).toBe("2026-06-05");
    expect(parseInvoiceDate("14.5.26")).toBe("2026-05-14");
  });

  it("passes an ISO date through", () => {
    expect(parseInvoiceDate("2026-05-14")).toBe("2026-05-14");
  });

  it("refuses nonsense rather than clamping it", () => {
    expect(parseInvoiceDate("32/05/2026")).toBeNull();
    expect(parseInvoiceDate("14/13/2026")).toBeNull();
    expect(parseInvoiceDate("no date here")).toBeNull();
  });
});

describe("isAllowedInvoiceHost", () => {
  it("accepts the Invoice One hosts and their subdomains", () => {
    expect(isAllowedInvoiceHost("https://invoice-one.co.il/doc/1")).toBe(true);
    expect(isAllowedInvoiceHost("https://app.invoice-one.com/x")).toBe(true);
    expect(isAllowedInvoiceHost("https://menahel4u.com/view?id=1")).toBe(true);
  });

  it("rejects anything else, because the server follows this link", () => {
    // An email body is untrusted input and this fetch leaves our network.
    expect(isAllowedInvoiceHost("https://evil.example/doc")).toBe(false);
    expect(isAllowedInvoiceHost("https://invoice-one.com.evil.example/")).toBe(false);
    expect(isAllowedInvoiceHost("file:///etc/passwd")).toBe(false);
    expect(isAllowedInvoiceHost("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedInvoiceHost("not a url")).toBe(false);
  });
});

describe("extractViewerUrl", () => {
  const link = (href: string, text: string) => `<a href="${href}">${text}</a>`;

  it("prefers the anchor that says it opens the document", () => {
    const html = `
      ${link("https://invoice-one.co.il/unsubscribe", "הסרה מרשימת התפוצה")}
      ${link("https://invoice-one.co.il/doc/abc123", "לחץ כאן לצפיה במסמך")}`;
    expect(extractViewerUrl(html)).toBe("https://invoice-one.co.il/doc/abc123");
  });

  it("falls back to any allowed link when none is labelled", () => {
    expect(extractViewerUrl(link("https://menahel4u.com/v/9", "מסמך"))).toBe(
      "https://menahel4u.com/v/9",
    );
  });

  it("never returns a link off the allowed hosts", () => {
    const html = `
      ${link("https://evil.example/steal", "לחץ כאן לצפיה במסמך")}
      ${link("https://invoice-one.co.il/doc/ok", "משהו אחר")}`;
    expect(extractViewerUrl(html)).toBe("https://invoice-one.co.il/doc/ok");
  });

  it("is null when there is nothing to follow", () => {
    expect(extractViewerUrl("<p>אין כאן קישור</p>")).toBeNull();
    expect(extractViewerUrl(link("https://evil.example/x", "לחץ כאן"))).toBeNull();
  });
});

describe("parseInvoiceDocument", () => {
  it("reads the fields off a well-formed document", () => {
    const result = parseInvoiceDocument(invoiceHtml());
    expect(result).toMatchObject({
      ok: true,
      customerName: "ניר כהן",
      invoiceNumber: "2026-0187",
      invoiceDate: "2026-05-14",
      netAgorot: 120000,
      totalAgorot: 141600,
      vatAgorot: 21600,
    });
  });

  it("does not mistake the total row for the VAT row", () => {
    // Both labels contain "מע\"מ". Reading the total as VAT would make the
    // document look self-inconsistent and refuse a perfectly good invoice.
    const result = parseInvoiceDocument(invoiceHtml());
    expect(result.ok && result.vatAgorot).toBe(21600);
  });

  it("prefers the summary total over a line item of the same shape", () => {
    const result = parseInvoiceDocument(invoiceHtml());
    expect(result.ok && result.totalAgorot).toBe(141600);
  });

  it("survives bidi marks and a shekel sign in the amounts", () => {
    const html = invoiceHtml({ total: "‏1,416.00 ₪", net: "1,200.00 ₪" });
    expect(parseInvoiceDocument(html)).toMatchObject({ ok: true, totalAgorot: 141600 });
  });

  it("copes with a missing date, which is not safety-critical", () => {
    const html = invoiceHtml().replace(/<tr><td>תאריך<\/td>[\s\S]*?<\/tr>/, "");
    const result = parseInvoiceDocument(html);
    expect(result.ok).toBe(true);
    expect(result.ok && result.invoiceDate).toBeNull();
  });

  /* ---------------------------------------------------------------------- */
  /* Refusals                                                                */
  /* ---------------------------------------------------------------------- */

  it("refuses a document whose numbers do not add up", () => {
    // The self-check that makes an unattended parser safe: three fields are
    // read independently and must agree. Here VAT contradicts the difference.
    const result = parseInvoiceDocument(invoiceHtml({ vat: "500.00" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("מע");
  });

  it("refuses when the implied rate is not a plausible VAT", () => {
    // Catches a total picked up from the wrong row: two unrelated numbers
    // rarely sit at a tax rate from each other.
    const html = invoiceHtml({ net: "1,200.00", vat: "", total: "9,000.00" })
      .replace(/<tr><td>מע"מ 18%<\/td><td><\/td><\/tr>/, "");
    const result = parseInvoiceDocument(html);
    expect(result.ok).toBe(false);
  });

  it("refuses a total below the net", () => {
    const result = parseInvoiceDocument(
      invoiceHtml({ net: "1,416.00", vat: "216.00", total: "1,200.00" }),
    );
    expect(result.ok).toBe(false);
  });

  it("refuses when the customer is missing", () => {
    const html = invoiceHtml().replace(/<tr><td>לכבוד<\/td>[\s\S]*?<\/tr>/, "");
    const result = parseInvoiceDocument(html);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("לקוח");
  });

  it("refuses when the invoice number is missing", () => {
    const html = invoiceHtml().replace(/<tr><td>חשבונית מס<\/td>[\s\S]*?<\/tr>/, "");
    const result = parseInvoiceDocument(html);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("מספר");
  });

  it("refuses when the amounts are missing entirely", () => {
    const html = invoiceHtml()
      .replace(/<tr><td>סה"כ לפני מע"מ<\/td>[\s\S]*?<\/tr>/, "")
      .replace(/<tr><td>סה"כ לתשלום<\/td>[\s\S]*?<\/tr>/, "");
    expect(parseInvoiceDocument(html).ok).toBe(false);
  });

  it("refuses an empty or error page", () => {
    expect(parseInvoiceDocument("").ok).toBe(false);
    expect(parseInvoiceDocument("<html><body>404</body></html>").ok).toBe(false);
  });

  it("refuses a login wall rather than reading whatever is on it", () => {
    const wall = `<html><body dir="rtl"><h1>נדרשת התחברות</h1>
      <p>לצפייה במסמך יש להזדהות</p></body></html>`;
    expect(parseInvoiceDocument(wall).ok).toBe(false);
  });
});
