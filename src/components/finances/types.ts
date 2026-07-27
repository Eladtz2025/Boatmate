import type { MemberBalance } from "@/lib/balance";

/**
 * Plain, serialisable shapes handed from the /finances server component down to
 * the client widgets. They mirror the row types in lib/data.ts but are declared
 * here so no client module has to import a `server-only` file.
 */

export type FinanceMember = {
  userId: string;
  name: string;
  color: string;
};

export type FinanceShare = {
  userId: string;
  shareAgorot: number;
};

export type FinanceExpense = {
  id: string;
  paidBy: string;
  amountAgorot: number;
  category: string;
  description: string | null;
  spentOn: string;
  receiptPath: string | null;
  source: string;
  shares: FinanceShare[];
};

export type FinanceTransfer = {
  id: string;
  fromUser: string;
  toUser: string;
  amountAgorot: number;
  transferredOn: string;
  note: string | null;
};

export type FinanceRecurring = {
  id: string;
  title: string;
  category: string;
  amountAgorot: number;
  cadence: string;
  dayOfMonth: number;
  active: boolean;
  defaultPaidBy: string | null;
  splitMode: string;
};

export type FinanceOccurrence = {
  id: string;
  recurringPaymentId: string;
  title: string;
  category: string;
  amountAgorot: number;
  dueOn: string;
  status: string;
  defaultPaidBy: string | null;
};

export type FinanceBalance = MemberBalance;

export const TAB_VALUES = ["overview", "expenses", "transfers", "recurring"] as const;
export type FinanceTab = (typeof TAB_VALUES)[number];

export const FINANCE_TABS: ReadonlyArray<{ value: FinanceTab; label: string }> = [
  { value: "overview", label: "סקירה" },
  { value: "expenses", label: "הוצאות" },
  { value: "transfers", label: "העברות" },
  { value: "recurring", label: "הוראות קבע" },
];

export function isFinanceTab(value: string | undefined): value is FinanceTab {
  return !!value && (TAB_VALUES as readonly string[]).includes(value);
}

/** userId → member, for the many places that render a name next to an amount. */
export function memberIndex(members: FinanceMember[]): Record<string, FinanceMember> {
  return Object.fromEntries(members.map((m) => [m.userId, m]));
}

export function memberNameMap(members: FinanceMember[]): Record<string, string> {
  return Object.fromEntries(members.map((m) => [m.userId, m.name]));
}
