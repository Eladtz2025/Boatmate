import "server-only";
import { createClient } from "./supabase/server";
import { splitEqual } from "./balance";
import { getMembers } from "./data";
import { getInvoiceMessage, gmailSession, listInvoiceMessageIds } from "./gmail";
import {
  extractViewerUrl,
  parseInvoiceItems,
  type ParsedInvoice,
} from "./invoice-one";
import { fetchInvoiceItems } from "./invoice-pdf";
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

  // Not the viewer page - that is an empty Angular shell. `fetchInvoiceItems`
  // walks on to the API the shell would have called and reads the PDF it
  // returns. See lib/invoice-pdf.ts.
  const document = await fetchInvoiceItems(viewerUrl);
  if (!document.ok) return { ok: false, reason: document.reason };

  const parsed = parseInvoiceItems(document.items);
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
    .select("id, gmail_message_id, invoice_number, status")
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

  /*
   * Only an **imported** message is finished with.
   *
   * A skip is a judgement made with the code as it stood, and "no customer
   * name on this document" turned out to be a fault in how the document was
   * fetched rather than anything about the invoice. Treating a skip as final
   * meant fixing that fault fixed nothing: the messages it had already
   * dismissed would never be looked at again. So skips are retried on every
   * sync and their row is updated in place, and only a real expense closes a
   * message for good.
   */
  const importedMessages = new Set(
    (seenRows ?? [])
      .filter((row) => row.status === "imported")
      .map((row) => row.gmail_message_id),
  );

  /** Message id to the existing row, for anything skipped on an earlier run. */
  const retryable = new Map(
    (seenRows ?? [])
      .filter((row) => row.status !== "imported")
      .map((row) => [row.gmail_message_id, row.id as string]),
  );

  // Invoice numbers are only claimed by rows that became an expense; a skipped
  // row's number must not block the retry of its own message.
  const seenNumbers = new Set(
    (seenRows ?? [])
      .filter((row) => row.status === "imported")
      .map((row) => row.invoice_number)
      .filter((value): value is string => Boolean(value)),
  );

  const outcomes: ImportOutcome[] = [];

  for (const messageId of messageIds) {
    if (importedMessages.has(messageId)) {
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
      existingRowId: retryable.get(messageId) ?? null,
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
  /** The row from a previous skip, if this message has been seen before. */
  existingRowId: string | null;
  userId: string | null;
}): Promise<ImportOutcome> {
  const { supabase, boatId, messageId, existingRowId } = input;

  /**
   * Record why this message was not imported.
   *
   * Updated in place when the message has been skipped before, because the
   * unique constraint on (boat_id, gmail_message_id) is what stops a second
   * expense and would equally stop a second *note*. The row is the latest
   * attempt, not a log of every one.
   */
  const skip = async (reason: string): Promise<ImportOutcome> => {
    if (existingRowId) {
      await supabase
        .from("invoice_imports")
        .update({ status: "skipped", reason, imported_at: new Date().toISOString() })
        .eq("id", existingRowId);
    } else {
      await supabase.from("invoice_imports").insert({
        boat_id: boatId,
        gmail_message_id: messageId,
        status: "skipped",
        reason,
        imported_by: input.userId,
      });
    }
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

  /*
   * Claim first, then create the expense. Reversing that would double-charge
   * the boat whenever the recording failed, and claiming is what makes two
   * concurrent syncs safe.
   *
   * Two shapes, because a retried message already has a row: a fresh message
   * is an insert the unique constraint arbitrates, and a previously skipped
   * one is a conditional update that only succeeds while the row still says
   * skipped. Postgres locks the row for that update, so of two syncs racing on
   * the same retry exactly one changes it and the other matches nothing - the
   * same guarantee the constraint gives, by a different route.
   */
  const claimFields = {
    invoice_number: invoice.invoiceNumber,
    status: "imported" as const,
    reason: null,
    customer_name: invoice.customerName,
    net_agorot: invoice.netAgorot,
    total_agorot: invoice.totalAgorot,
    invoice_date: invoice.invoiceDate,
    imported_at: new Date().toISOString(),
    imported_by: input.userId,
  };

  let claimId: string;

  if (existingRowId) {
    const { data: claimed, error } = await supabase
      .from("invoice_imports")
      .update(claimFields)
      .eq("id", existingRowId)
      .neq("status", "imported")
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[invoice-import] reclaim", messageId, error);
      return { messageId, status: "skipped", reason: "רישום הייבוא נכשל" };
    }
    // Nothing matched: another sync imported it between our read and now.
    if (!claimed) return { messageId, status: "already" };
    claimId = claimed.id;
  } else {
    const { data: claimed, error } = await supabase
      .from("invoice_imports")
      .insert({ boat_id: boatId, gmail_message_id: messageId, ...claimFields })
      .select("id")
      .single();

    if (error) {
      // 23505 is a unique violation: somebody else got there first, which is
      // the duplicate protection working rather than a failure.
      if (error.code === "23505") return { messageId, status: "already" };
      console.error("[invoice-import] claim", messageId, error);
      return { messageId, status: "skipped", reason: "רישום הייבוא נכשל" };
    }
    claimId = claimed.id;
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
    // Release the claim so a later sync tries again. Put back as skipped
    // rather than deleted, because skipped is retryable now and the row keeps
    // the reason instead of the failure vanishing.
    console.error("[invoice-import] create_expense", messageId, expenseError);
    await supabase
      .from("invoice_imports")
      .update({
        status: "skipped",
        reason: "יצירת ההוצאה נכשלה",
        invoice_number: null,
      })
      .eq("id", claimId);
    return { messageId, status: "skipped", reason: "יצירת ההוצאה נכשלה" };
  }

  await supabase
    .from("invoice_imports")
    .update({ expense_id: expenseId as unknown as string })
    .eq("id", claimId);

  return {
    messageId,
    status: "imported",
    invoiceNumber: invoice.invoiceNumber,
    amountAgorot: decision.amountAgorot,
  };
}
