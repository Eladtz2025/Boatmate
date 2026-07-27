import { formatAgorotAbs, formatShortDate, formatRelativeDays } from "./format";
import type { MemberBalance, Settlement } from "./balance";

/**
 * WhatsApp sharing. Partners coordinate in a group chat, so most screens can
 * export a tidy Hebrew summary straight into it.
 *
 * `wa.me` works on desktop and mobile alike; where the platform supports the
 * Web Share API we prefer it, because that lets the user pick the exact chat.
 */

export function whatsappUrl(text: string, phone?: string): string {
  const encoded = encodeURIComponent(text);
  return phone
    ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

/** Share via the native sheet when available, else fall back to WhatsApp. */
export async function share(text: string, title = "Boatmate"): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (error) {
      // User dismissed the sheet — do not fall through to WhatsApp.
      if ((error as Error)?.name === "AbortError") return;
    }
  }
  window.open(whatsappUrl(text), "_blank", "noopener,noreferrer");
}

const nameOf = (names: Record<string, string>, id: string) => names[id] ?? "שותף";

/* -------------------------------------------------------------------------- */
/* Message builders                                                           */
/* -------------------------------------------------------------------------- */

export function balanceMessage(
  boatName: string,
  balances: MemberBalance[],
  settlements: Settlement[],
  names: Record<string, string>,
): string {
  const lines = [`⚓ *${boatName}* — יתרות בין שותפים`, ""];

  for (const b of balances) {
    const label =
      b.balanceAgorot > 0
        ? `מגיע לו ${formatAgorotAbs(b.balanceAgorot)}`
        : b.balanceAgorot < 0
          ? `חייב ${formatAgorotAbs(b.balanceAgorot)}`
          : "מאוזן";
    lines.push(`• ${nameOf(names, b.userId)}: ${label}`);
  }

  if (settlements.length > 0) {
    lines.push("", "*להסדרה:*");
    for (const s of settlements) {
      lines.push(
        `↩️ ${nameOf(names, s.fromUser)} → ${nameOf(names, s.toUser)}: ${formatAgorotAbs(s.amountAgorot)}`,
      );
    }
  } else {
    lines.push("", "✅ כולם מאוזנים");
  }

  return lines.join("\n");
}

export function expenseMessage(
  boatName: string,
  input: {
    description: string | null;
    categoryLabel: string;
    amountAgorot: number;
    spentOn: string;
    paidByName: string;
  },
): string {
  return [
    `⚓ *${boatName}* — הוצאה חדשה`,
    "",
    `${input.description || input.categoryLabel}`,
    `סכום: ${formatAgorotAbs(input.amountAgorot)}`,
    `תאריך: ${formatShortDate(input.spentOn)}`,
    `שולם על ידי: ${input.paidByName}`,
  ].join("\n");
}

export function upcomingPaymentsMessage(
  boatName: string,
  items: Array<{ title: string; amountAgorot: number; dueOn: string }>,
): string {
  if (items.length === 0) return `⚓ *${boatName}* — אין תשלומים קרובים`;

  const lines = [`⚓ *${boatName}* — תשלומים קרובים`, ""];
  for (const item of items) {
    lines.push(
      `• ${item.title} — ${formatAgorotAbs(item.amountAgorot)} (${formatRelativeDays(item.dueOn)})`,
    );
  }
  return lines.join("\n");
}

export function eventMessage(
  boatName: string,
  input: { title: string; startsAt: string; location?: string | null },
): string {
  const lines = [
    `⚓ *${boatName}*`,
    "",
    `📅 ${input.title}`,
    formatShortDate(input.startsAt),
  ];
  if (input.location) lines.push(`📍 ${input.location}`);
  return lines.join("\n");
}

export function documentMessage(
  boatName: string,
  input: { title: string; categoryLabel: string; expiresOn?: string | null },
  signedUrl?: string,
): string {
  const lines = [
    `⚓ *${boatName}* — מסמך`,
    "",
    `📄 ${input.title} (${input.categoryLabel})`,
  ];
  if (input.expiresOn) {
    lines.push(`תוקף עד: ${formatShortDate(input.expiresOn)}`);
  }
  if (signedUrl) {
    lines.push("", signedUrl, "_הקישור יפוג תוך שעה_");
  }
  return lines.join("\n");
}
