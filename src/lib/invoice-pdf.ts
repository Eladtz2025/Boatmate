import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import {
  documentIdFromViewerUrl,
  isAllowedInvoiceHost,
  type PdfTextItem,
} from "./invoice-one";

/**
 * Getting the actual document out of the Invoice One viewer.
 *
 * The link in the email does **not** serve the invoice. It serves an Angular
 * shell — 1.8KB of `<m4u-app-root>` and a loading spinner — which then asks an
 * API for the document and renders the PDF it gets back. Fetching that URL and
 * reading it as HTML is what made the first production sync skip all twelve
 * messages with "לא נמצא שם הלקוח בחשבונית": the parser was correct, it was
 * simply looking at a page that has no invoice on it.
 *
 * So this module walks the real chain:
 *
 *   1. the viewer URL carries a **DocumentID** in its path;
 *   2. `GET /ViewerNew/api/GreeViewer/Document/GetPDF?DocumentID=…` answers
 *      with JSON — `{ Entity: { ArrData: <base64 PDF>, FileName, … } }`;
 *   3. that PDF has a real text layer, which is extracted **with positions**,
 *      because the invoice is a table and its cells only line up by geometry.
 *
 * The endpoint and response shape are not guessed: they were read out of the
 * viewer's own bundle and confirmed against a live document.
 */

const TIMEOUT_MS = 20_000;

/** Anything bigger than this is not an invoice we should be decoding. */
const MAX_PDF_BYTES = 15 * 1024 * 1024;

export type DocumentFetch =
  | { ok: true; items: PdfTextItem[]; fileName: string | null }
  | { ok: false; reason: string };

type GetPdfResponse = {
  Entity?: {
    ArrData?: string;
    FileName?: string;
    DocumentType?: string;
  };
  IsSuccess?: boolean;
};

/**
 * The API URL for a document, built on the viewer link's own origin.
 *
 * Same-origin by construction rather than hardcoded, so a link that arrives on
 * `www.` or on the `.co.il` domain is followed there instead of being silently
 * redirected somewhere else — and the host is still checked against the
 * allowlist, because this call leaves our network.
 */
function apiUrlFor(viewerUrl: string): string | null {
  const documentId = documentIdFromViewerUrl(viewerUrl);
  if (!documentId) return null;

  try {
    const { origin } = new URL(viewerUrl);
    const api = new URL("/ViewerNew/api/GreeViewer/Document/GetPDF", origin);
    api.searchParams.set("DocumentID", documentId);
    return isAllowedInvoiceHost(api.toString()) ? api.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Positioned text for the invoice behind a viewer link.
 *
 * Every failure is a reason rather than a throw, because a document that
 * cannot be read is an ordinary outcome the sync reports and retries later —
 * not something that should take a sync down.
 */
export async function fetchInvoiceItems(viewerUrl: string): Promise<DocumentFetch> {
  const apiUrl = apiUrlFor(viewerUrl);
  if (!apiUrl) return { ok: false, reason: "קישור המסמך אינו קישור חשבונית מוכר" };

  let payload: GetPdfResponse;
  try {
    const response = await fetch(apiUrl, {
      headers: { Accept: "application/json", "User-Agent": "Boatmate/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
      redirect: "follow",
    });

    if (!response.ok) {
      console.error("[invoice-pdf] GetPDF", response.status, apiUrl);
      return { ok: false, reason: `שרת החשבוניות החזיר שגיאה (${response.status})` };
    }

    payload = (await response.json()) as GetPdfResponse;
  } catch (error) {
    console.error("[invoice-pdf] GetPDF", error);
    return { ok: false, reason: "לא הצלחנו להוריד את מסמך החשבונית" };
  }

  const entity = payload.Entity;
  if (!entity?.ArrData) {
    return { ok: false, reason: "מסמך החשבונית לא הוחזר מהשרת" };
  }

  // Anything that is not a PDF is a document shape this parser has never seen,
  // and reading it would be exactly the guessing this code exists to avoid.
  if (entity.DocumentType && entity.DocumentType.toUpperCase() !== "PDF") {
    return {
      ok: false,
      reason: `סוג המסמך (${entity.DocumentType}) אינו נתמך`,
    };
  }

  const bytes = Buffer.from(entity.ArrData, "base64");
  if (bytes.length === 0) return { ok: false, reason: "מסמך החשבונית ריק" };
  if (bytes.length > MAX_PDF_BYTES) {
    return { ok: false, reason: "מסמך החשבונית גדול מדי" };
  }
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return { ok: false, reason: "מסמך החשבונית אינו קובץ PDF תקין" };
  }

  try {
    const items = await readPdfItems(bytes);
    if (items.length === 0) {
      // A scanned image has no text layer. Refusing is right: guessing at an
      // amount from an image is exactly what must not happen here.
      return { ok: false, reason: "אין שכבת טקסט במסמך החשבונית" };
    }
    return { ok: true, items, fileName: entity.FileName ?? null };
  } catch (error) {
    console.error("[invoice-pdf] extract", error);
    return { ok: false, reason: "קריאת מסמך ה-PDF נכשלה" };
  }
}

/**
 * Every run of text on every page, with the coordinates the PDF gives it.
 *
 * Pages are stacked into one coordinate space by offsetting each page's `y`
 * downward, so a two-page invoice still groups into rows correctly instead of
 * interleaving page one's summary with page two's header.
 */
async function readPdfItems(bytes: Buffer): Promise<PdfTextItem[]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const items: PdfTextItem[] = [];

  // Touching `extractText` first is what makes unpdf resolve its worker in the
  // serverless runtime; the positioned pass below reuses the same proxy.
  await extractText(pdf, { mergePages: true });

  let pageOffset = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    for (const item of content.items) {
      const run = item as { str?: string; transform?: number[] };
      if (!run.str || !run.transform) continue;
      const text = run.str.trim();
      if (!text) continue;

      items.push({
        text,
        x: run.transform[4],
        y: run.transform[5] - pageOffset,
      });
    }

    pageOffset += viewport.height;
  }

  return items;
}
