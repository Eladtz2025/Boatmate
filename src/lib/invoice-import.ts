import "server-only";
import { createClient } from "./supabase/server";
import { splitEqual } from "./balance";
import { getMembers } from "./data";
import { getInvoiceMessage, gmailSession, listInvoiceMessageIds } from "./gmail";
import {
  extractViewerUrl,
  isAllowedInvoiceHost,
  parseInvoiceDocument,
  type ParsedInvoice,
} from "./invoice-one";
import { decideInvoiceExpense } from "./invoice-rules";

/**
 * Gmail → an expense, once.
 *
 * The order of operations here is the whole safety story, so it is worth
 * stating plainly:
 *
 *   1. list the sender's messages since the backfill floor — the *whole*
 *      window, every time;
 *   2. skip anything `invoice_imports` already knows about;
 *   3. follow the document link and parse it, refusing on any doubt;
 *   4. **claim** the message id in `invoice_imports`;
 *   5. create the expense;
 *   6. record the expense id against the claim, or release the claim if the
 *      expense could not be created.
 *
 * Claiming before creating is what makes "never two expenses for one invoice"
 * true even with two syncs running at once: the unique constraint on
 * (boat_id, gmail_message_id) means the second one loses and skips. Doing it
 * the other way round — create, then record — would double-charge the boat if
 * the recording failed.
 */

/** Only this sender is ever read. */
export const INVOICE_SENDER = "sender@invoice-one.com";

/**
 * How far back the first sync reaches, and every sync after it.
 *
 * Fixed rather than "since last run" on purpose. A moving cursor is only
 * correct if mail never arrives out of order, and it silently loses anything
 * that does; re-reading a bounded window and letting the import table decide
 * what is new costs one cheap Gmail query and cannot skip.
 */
export const BACKFILL_FROM = "2026/05/01";

/** Imported expenses land here; the boat has no better fitting category. */
const EXPENSE_CATEGORY = "other";

const DOCUMENT_TIMEOUT_MS = 15_000;

export type ImportOutcome =
  | { messageId: string; status: "imported"; invoiceNumber: string; amountAgorot: number }
  | { messageId: string; status: "skipped"; reason: string }
  | { messageId: string; status: "already" };

export type SyncResult =
  | {
      ok: true;
      imported: number;
      skipped: number;
      alreadyImported: number;
      outcomes: ImportOutcome[];
    }
  | { ok: false; error: string };

/* -------------------------------------------------------------------------- */
/* Fetching the document                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Follow the viewer link and read the page.
 *
 * The host is re-checked here even though `extractViewerUrl` already filtered:
 * this is the call that actually leaves our network, and a redirect can move it
 * somewhere the first check never saw. Redirects are followed manually for that
 * reason.
 *
 * Charset matters. Israeli document pages are still sometimes served as
 * windows-1255, and decoding those as UTF-8 turns every Hebrew label into
 * replacement characters — at which point the parser finds no labels and
 * refuses, which is safe but useless.
 */
async function fetchInvoiceDocument(url: string): Promise<string | null> {
  let current = url;

  for (let hop = 0; hop < 5; hop += 1) {
    if (!isAllowedInvoiceHost(current)) {
      console.error("[invoice-import] blocked host", current);
      return null;
    }

    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(DOCUMENT_TIMEOUT_MS),
      cache: "no-store",
      headers: { "User-Agent": "Boatmate/1.0 (invoice import)" },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      current = new URL(location, current).toString();
      continue;
    }

    if (!response.ok) {
      console.error("[invoice-import] document", response.status, current);
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const charset = /charset=([\w-]+)/i.exec(contentType)?.[1] ?? "utf-8";
    const buffer = await response.arrayBuffer();

    try {
      return new TextDecoder(charset).decode(buffer);
    } catch {
      return new TextDecoder("utf-8").decode(buffer);
    }
  }

  console.error("[invoice-import] too many redirects", url);
  return null;
}

/* -------------------------------------------------------------------------- */
/* One message                                                                */
/* -------------------------------------------------------------------------- */

type Crew = Array<{ userId: string; name: string }>;

/**
 * Read one message all the way to a parsed invoice, or say why not.
 *
 * Nothing is written here. Every refusal is a plain reason, and a refusal is a
 * perfectly ordinary outcome: an invoice made out to somebody who is not a
 * partner is not an error, it is simply not ours.
 */
async function readInvoice(
  accessToken: string,
  messageId: string,
): Promise<{ ok: true; invoice: ParsedInvoice } | { ok: false; reason: string }> {
  const message = await getInvoiceMessage(accessToken, messageId);

  const viewerUrl = extractViewerUrl(message.body);
  if (!viewerUrl) {
    return { ok: false, reason: "לא נמצא קישור למסמך החשבונית במייל" };
  }

  const document = await fetchInvoiceDocument(viewerUrl);
  if (document === null) {
    return { ok: false, reason: "לא הצלחנו לפתוח את מסמך החשבונית" };
  }

  const parsed = parseInvoiceDocument(document);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  return { ok: true, invoice: parsed };
}

/* -------------------------------------------------------------------------- */
/* The sync                                                                   */
/* -------------------------------------------------------------------------- */

export async function syncInvoices(boatId: string): Promise<SyncResult> {
  const session = await gmailSession(boatId);
  if (!session.ok) return { ok: false, error: session.reason };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const members = await getMembers(boatId);
  const crew: Crew = members.map((member) => ({
    userId: member.userId,
    name: member.name,
  }));
  const everyone = members.map((member) => member.userId);

  if (everyone.length === 0) {
    return { ok: false, error: "אין שותפים בסירה לחלוקת ההוצאה" };
  }

  let messageIds: string[];
  try {
    messageIds = await listInvoiceMessageIds({
      accessToken: session.accessToken,
      sender: INVOICE_SENDER,
      afterDate: BACKFILL_FROM,
    });
  } catch (error) {
    console.error("[invoice-import] list", error);
    return { ok: false, error: "החיפוש ב-Gmail נכשל." };
  }

  // Everything already dealt with, in one read rather than one per message.
  const { data: seenRows, error: seenError } = await supabase
    .from("invoice_imports")
    .select("gmail_message_id, invoice_number")
    .eq("boat_id", boatId);

  if (seenError) {
    console.error("[invoice-import] read imports", seenError);
    return {
      ok: false,
      error:
        seenError.code === "42P01" || seenError.code === "PGRST205"
          ? "טבלת ייבוא החשבוניות עדיין לא נוצרה במסד הנתונים."
          : "לא הצלחנו לקרוא את רשימת החשבוניות שכבר יובאו.",
    };
  }

  const seenMessages = new Set((seenRows ?? []).map((row) => row.gmail_message_id));
  const seenNumbers = new Set(
    (seenRows ?? [])
      .map((row) => row.invoice_number)
      .filter((value): value is string => Boolean(value)),
  );

  const outcomes: ImportOutcome[] = [];

  for (const messageId of messageIds) {
    if (seenMessages.has(messageId)) {
      outcomes.push({ messageId, status: "already" });
      continue;
    }

    const outcome = await importMessage({
      supabase,
      boatId,
      accessToken: session.accessToken,
      messageId,
      crew,
      everyone,
      seenNumbers,
      userId: user?.id ?? null,
    });

    outcomes.push(outcome);
    if (outcome.status === "imported") seenNumbers.add(outcome.invoiceNumber);
  }

  return {
    ok: true,
    imported: outcomes.filter((item) => item.status === "imported").length,
    skipped: outcomes.filter((item) => item.status === "skipped").length,
    alreadyImported: outcomes.filter((item) => item.status === "already").length,
    outcomes,
  };
}

async function importMessage(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  boatId: string;
  accessToken: string;
  messageId: string;
  crew: Crew;
  everyone: string[];
  seenNumbers: Set<string>;
  userId: string | null;
}): Promise<ImportOutcome> {
  const { supabase, boatId, messageId } = input;

  /** Record a deliberate non-import so the same message is not re-read forever. */
  const skip = async (reason: string): Promise<ImportOutcome> => {
    await supabase.from("invoice_imports").insert({
      boat_id: boatId,
      gmail_message_id: messageId,
      status: "skipped",
      reason,
      imported_by: input.userId,
    });
    return { messageId, status: "skipped", reason };
  };

  let read;
  try {
    read = await readInvoice(input.accessToken, messageId);
  } catch (error) {
    console.error("[invoice-import] read", messageId, error);
    // Not recorded: a transient failure should be retried on the next sync,
    // unlike a document we understood and decided against.
    return { messageId, status: "skipped", reason: "קריאת המייל נכשלה" };
  }

  if (!read.ok) return skip(read.reason);

  const { invoice } = read;

  // The same invoice arriving as a second message — a resend or a forward —
  // must not be paid twice, and it carries a different Gmail id.
  if (input.seenNumbers.has(invoice.invoiceNumber)) {
    return skip(`חשבונית ${invoice.invoiceNumber} כבר יובאה`);
  }

  const decision = decideInvoiceExpense(invoice, input.crew);
  if (!decision.ok) return skip(decision.reason);

  // Claim first. If two syncs race, the unique constraint decides.
  const { data: claim, error: claimError } = await supabase
    .from("invoice_imports")
    .insert({
      boat_id: boatId,
      gmail_message_id: messageId,
      invoice_number: invoice.invoiceNumber,
      status: "imported",
      customer_name: invoice.customerName,
      net_agorot: invoice.netAgorot,
      total_agorot: invoice.totalAgorot,
      invoice_date: invoice.invoiceDate,
      imported_by: input.userId,
    })
    .select("id")
    .single();

  if (claimError) {
    // 23505 is a unique violation: somebody else got there first, which is the
    // duplicate protection working rather than a failure.
    if (claimError.code === "23505") {
      return { messageId, status: "already" };
    }
    console.error("[invoice-import] claim", messageId, claimError);
    return { messageId, status: "skipped", reason: "רישום הייבוא נכשל" };
  }

  const shares = splitEqual(decision.amountAgorot, input.everyone);
  const basisLabel = decision.basis === "net" ? "לפני מע״מ" : "כולל מע״מ";

  const { data: expenseId, error: expenseError } = await supabase.rpc(
    "create_expense",
    {
      p_boat_id: boatId,
      p_paid_by: decision.userId,
      p_amount_agorot: decision.amountAgorot,
      p_shares: shares.map((share) => ({
        user_id: share.userId,
        share_agorot: share.shareAgorot,
      })),
      p_category: EXPENSE_CATEGORY,
      p_description: `חשבונית ${invoice.invoiceNumber} — ${decision.partnerName}`,
      p_spent_on: invoice.invoiceDate ?? undefined,
      p_split_mode: "equal",
      p_note: `יובא מ-Gmail · ${basisLabel}`,
      p_source: "gmail",
    },
  );

  if (expenseError) {
    // Release the claim so a later sync can try again — an import that failed
    // to become an expense must not be remembered as done.
    console.error("[invoice-import] create_expense", messageId, expenseError);
    await supabase.from("invoice_imports").delete().eq("id", claim.id);
    return { messageId, status: "skipped", reason: "יצירת ההוצאה נכשלה" };
  }

  await supabase
    .from("invoice_imports")
    .update({ expense_id: expenseId as unknown as string })
    .eq("id", claim.id);

  return {
    messageId,
    status: "imported",
    invoiceNumber: invoice.invoiceNumber,
    amountAgorot: decision.amountAgorot,
  };
}
