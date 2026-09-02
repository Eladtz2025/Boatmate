import { describe, expect, it } from "vitest";
import {
  documentIdFromViewerUrl,
  extractViewerUrl,
  groupRows,
  isAllowedInvoiceHost,
  parseInvoiceDate,
  parseInvoiceItems,
  parseShekels,
  type PdfTextItem,
} from "./invoice-one";

/**
 * These invoices become expenses with no human in the loop, so the tests that
 * matter most are the ones asserting the parser **refuses**. A wrong number
 * here moves real money between two people quietly; a refusal costs a partner
 * one manual entry.
 *
 * The fixture is the layout of a real Invoice One document — the coordinates
 * and the label wording were measured off one, including the details that
 * broke the first attempt: the label and its value sit on the same row with
 * the value to the *left*, and their baselines differ by a point or two. The
 * names, amounts and identifiers are made up, because this repository is
 * public and a live document token is a bearer credential.
 */

/** A page laid out the way a real one is: `[label, value]` pairs per row. */
function page(
  overrides: Partial<{
    customer: string;
    number: string;
    date: string;
    net: string;
    vat: string;
    vatLabel: string;
    total: string;
  }> = {},
): PdfTextItem[] {
  const f = {
    customer: "כחלון ניר",
    number: "79724",
    date: "01/09/2026",
    net: "₪ 2,128.72",
    vat: "₪ 383.17",
    vatLabel: 'מע"מ 18%',
    total: "₪ 2,511.89",
    ...overrides,
  };

  return [
    // Header: the addressee, and a note far to the left on the same row.
    { text: "לכבוד:", x: 546, y: 705.5 },
    { text: f.customer, x: 503.4, y: 705.8 },
    { text: "=== מסמך ממוחשב ===", x: 65, y: 706.2 },

    { text: "תאריך", x: 145.9, y: 692.8 },
    { text: f.date, x: 23.5, y: 693.5 },

    { text: 'ח.פ.\\ ת.ז.', x: 503.9, y: 688.3 },
    { text: "040198780", x: 438.2, y: 687.6 },

    // "מקור" sits further left than the number; nearest-left must win.
    { text: "חשבונית מס קבלה", x: 310, y: 580 },
    { text: f.number, x: 260, y: 580 },
    { text: "מקור", x: 32, y: 580 },

    // A line item carrying money of its own, above the summary.
    { text: "דמי עגינה חודשיים לספינה", x: 395.9, y: 542.3 },
    { text: "₪ 161.88", x: 137.3, y: 542.3 },
    { text: f.net, x: 50.8, y: 542.3 },

    // The summary block. Baselines differ from their labels by up to 1.5pt.
    { text: 'סה"כ חייב מע"מ', x: 126.6, y: 516.5 },
    { text: f.net, x: 54, y: 515.8 },

    { text: f.vatLabel, x: 142.1, y: 442 },
    { text: f.vat, x: 63, y: 440.5 },

    { text: 'סה"כ לתשלום', x: 132.7, y: 425.4 },
    { text: f.total, x: 58.1, y: 424.4 },

    // The payment section repeats the total under different labels.
    { text: 'סה"כ אשראי', x: 118, y: 331 },
    { text: f.total, x: 58, y: 330 },
    { text: 'סה"כ', x: 118, y: 288 },
    { text: f.total, x: 58, y: 287 },
  ];
}

describe("groupRows", () => {
  it("pairs a label with the value beside it despite a baseline wobble", () => {
    // The measured case: label at y=442.0, its amount at y=440.5.
    const rows = groupRows([
      { text: 'מע"מ 18%', x: 142.1, y: 442 },
      { text: "₪ 383.17", x: 63, y: 440.5 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].items.map((item) => item.text)).toEqual(['מע"מ 18%', "₪ 383.17"]);
  });

  it("keeps genuinely different rows apart", () => {
    const rows = groupRows([
      { text: 'מע"מ 18%', x: 142.1, y: 442 },
      { text: 'סה"כ לתשלום', x: 132.7, y: 425.4 },
    ]);
    expect(rows).toHaveLength(2);
  });

  it("orders a row right to left, as Hebrew is read", () => {
    const rows = groupRows(page());
    const header = rows.find((row) => row.items.some((i) => i.text === "לכבוד:"));
    expect(header?.items.map((item) => item.text)).toEqual([
      "לכבוד:",
      "כחלון ניר",
      "=== מסמך ממוחשב ===",
    ]);
  });

  it("returns rows from the top of the page down", () => {
    const rows = groupRows(page());
    expect(rows[0].y).toBeGreaterThan(rows[rows.length - 1].y);
  });

  it("ignores whitespace-only runs", () => {
    expect(groupRows([{ text: "   ", x: 1, y: 1 }])).toHaveLength(0);
  });
});

describe("documentIdFromViewerUrl", () => {
  it("reads the id out of a real viewer link", () => {
    expect(
      documentIdFromViewerUrl(
        "https://invoice-one.com/ViewerNew/pages/Y_GreeViewer_document/ABC123XYZ",
      ),
    ).toBe("ABC123XYZ");
  });

  it("accepts the lower-cased form the site redirects to", () => {
    expect(
      documentIdFromViewerUrl(
        "https://invoice-one.com/viewernew/pages/Y_GreeViewer_document/ABC123XYZ",
      ),
    ).toBe("ABC123XYZ");
  });

  it("is null for the other links in the same email", () => {
    // The unsubscribe link differs only in the path, which is exactly why the
    // document is identified by path rather than by anchor wording.
    expect(
      documentIdFromViewerUrl(
        "https://invoice-one.com/ViewerNew/pages/Y_GreeViewer_unsubscribe/ABC123XYZ",
      ),
    ).toBeNull();
    expect(documentIdFromViewerUrl("http://www.invoice-one.com")).toBeNull();
    expect(documentIdFromViewerUrl("not a url")).toBeNull();
  });
});

describe("isAllowedInvoiceHost", () => {
  it("accepts the Invoice One hosts and their subdomains", () => {
    expect(isAllowedInvoiceHost("https://invoice-one.com/x")).toBe(true);
    expect(isAllowedInvoiceHost("https://www.invoice-one.com/x")).toBe(true);
    expect(isAllowedInvoiceHost("https://menahel4u.com/x")).toBe(true);
  });

  it("rejects anything else, because the server follows this link", () => {
    expect(isAllowedInvoiceHost("https://evil.example/doc")).toBe(false);
    expect(isAllowedInvoiceHost("https://invoice-one.com.evil.example/")).toBe(false);
    expect(isAllowedInvoiceHost("file:///etc/passwd")).toBe(false);
    expect(isAllowedInvoiceHost("http://169.254.169.254/latest/meta-data/")).toBe(false);
  });
});

describe("extractViewerUrl", () => {
  /** The real email's link set, in the order it sends them. */
  const email = `
    <a href="https://invoice-one.com/ViewerNew/pages/Y_GreeViewer_document/TOKEN1">לחץ כאן לצפיה במסמך</a>
    <a href="https://www.adobe.com/products/acrobat/readstep2.html">Adobe Reader</a>
    <a href="https://www.invoice-one.com/receipient/Technical.aspx">לחץ כאן</a>
    <a href="http://www.invoice-one.com">לחץ כאן</a>
    <a href="https://invoice-one.com/ViewerNew/pages/Y_GreeViewer_unsubscribe/TOKEN1">לחץ כאן</a>
    <a href="http://menahel4u.com/">www.menahel4u.com</a>`;

  it("picks the document link out of five", () => {
    expect(extractViewerUrl(email)).toBe(
      "https://invoice-one.com/ViewerNew/pages/Y_GreeViewer_document/TOKEN1",
    );
  });

  it("is not fooled by the unsubscribe link, which shares the wording", () => {
    const unsubscribeOnly = `
      <a href="https://invoice-one.com/ViewerNew/pages/Y_GreeViewer_unsubscribe/TOKEN1">לחץ כאן לצפיה במסמך</a>`;
    expect(extractViewerUrl(unsubscribeOnly)).toBeNull();
  });

  it("never returns a link off the allowed hosts", () => {
    const spoofed = `<a href="https://evil.example/ViewerNew/pages/Y_GreeViewer_document/X">לצפיה במסמך</a>`;
    expect(extractViewerUrl(spoofed)).toBeNull();
  });

  it("is null when there is nothing to follow", () => {
    expect(extractViewerUrl("<p>אין כאן קישור</p>")).toBeNull();
  });
});

describe("parseShekels", () => {
  it("reads Israeli formatting", () => {
    expect(parseShekels("₪ 2,128.72")).toBe(212872);
    expect(parseShekels("2,511.89")).toBe(251189);
    expect(parseShekels("161")).toBe(16100);
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
    expect(parseInvoiceDate("01/09/2026")).toBe("2026-09-01");
    expect(parseInvoiceDate("05/06/2026")).toBe("2026-06-05");
    expect(parseInvoiceDate("14.5.26")).toBe("2026-05-14");
  });

  it("refuses nonsense rather than clamping it", () => {
    expect(parseInvoiceDate("32/05/2026")).toBeNull();
    expect(parseInvoiceDate("14/13/2026")).toBeNull();
    expect(parseInvoiceDate("no date here")).toBeNull();
  });
});

describe("parseInvoiceItems", () => {
  it("reads every field off a real document layout", () => {
    expect(parseInvoiceItems(page())).toEqual({
      ok: true,
      customerName: "כחלון ניר",
      invoiceNumber: "79724",
      invoiceDate: "2026-09-01",
      netAgorot: 212872,
      totalAgorot: 251189,
      vatAgorot: 38317,
    });
  });

  it("takes the value immediately left of the label, not the far one", () => {
    // The addressee row also carries "=== מסמך ממוחשב ===" further left, and
    // the invoice-number row carries "מקור". Nearest wins.
    const parsed = parseInvoiceItems(page());
    expect(parsed.ok && parsed.customerName).toBe("כחלון ניר");
    expect(parsed.ok && parsed.invoiceNumber).toBe("79724");
  });

  it("does not read the line item's money as the summary", () => {
    // "דמי עגינה…" carries ₪161.88 and a repeat of the net on its own row.
    const parsed = parseInvoiceItems(page());
    expect(parsed.ok && parsed.netAgorot).toBe(212872);
  });

  it("does not mistake the total row for the VAT row", () => {
    // Both labels contain מע״מ. Reading the total as VAT would make the
    // document look self-inconsistent and refuse a perfectly good invoice.
    const parsed = parseInvoiceItems(page());
    expect(parsed.ok && parsed.vatAgorot).toBe(38317);
  });

  it("is not confused by the payment section repeating the total", () => {
    const parsed = parseInvoiceItems(page());
    expect(parsed.ok && parsed.totalAgorot).toBe(251189);
  });

  /* ---------------------------------------------------------------------- */
  /* Refusals                                                                */
  /* ---------------------------------------------------------------------- */

  it("refuses a document whose numbers do not add up", () => {
    // The self-check that makes an unattended parser safe: three fields are
    // read independently and must agree. Here VAT contradicts the difference.
    const result = parseInvoiceItems(page({ vat: "₪ 500.00" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("מע");
  });

  it("refuses when the implied rate is not a plausible VAT", () => {
    const result = parseInvoiceItems(
      page({ total: "₪ 9,000.00", vatLabel: "אחר" }),
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a total below the net", () => {
    const result = parseInvoiceItems(
      page({ net: "₪ 2,511.89", total: "₪ 2,128.72", vatLabel: "אחר" }),
    );
    expect(result.ok).toBe(false);
  });

  it("refuses when the customer is missing", () => {
    const items = page().filter((item) => item.text !== "לכבוד:");
    const result = parseInvoiceItems(items);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("לקוח");
  });

  it("refuses when the invoice number is missing", () => {
    const items = page().filter((item) => item.text !== "חשבונית מס קבלה");
    const result = parseInvoiceItems(items);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("מספר");
  });

  it("refuses when the summary is missing entirely", () => {
    const items = page().filter(
      (item) => !/סה"כ חייב|סה"כ לתשלום/.test(item.text),
    );
    expect(parseInvoiceItems(items).ok).toBe(false);
  });

  it("refuses an empty page — a PDF with no text layer", () => {
    expect(parseInvoiceItems([]).ok).toBe(false);
  });

  it("refuses a label with nothing to its left", () => {
    // A truncated document: the label is there, its cell is not.
    const items = page().filter((item) => item.text !== "כחלון ניר");
    expect(parseInvoiceItems(items).ok).toBe(false);
  });
});
