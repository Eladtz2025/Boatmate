import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/nav/app-header";
import { FinancesScreen } from "@/components/finances/finances-screen";
import { isFinanceTab, type FinanceTab } from "@/components/finances/types";
import {
  getBalances,
  getBoat,
  getCurrentUser,
  getExpenses,
  getMembers,
  getRecurringPayments,
  getTransfers,
  getUpcomingPayments,
} from "@/lib/data";
import { topUpOccurrences } from "@/lib/recurring";

export const metadata: Metadata = {
  title: "כספים — Boatmate",
};

/**
 * Server component: everything is read through lib/data.ts (RLS-scoped) and
 * handed down as plain data. `searchParams` is async in Next 16.
 */
export default async function FinancesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tabParam = typeof params.tab === "string" ? params.tab : undefined;
  const newParam = typeof params.new === "string" ? params.new : undefined;
  const initialTab: FinanceTab = isFinanceTab(tabParam) ? tabParam : "overview";

  const [boat, user] = await Promise.all([getBoat(), getCurrentUser()]);

  if (!boat) {
    return (
      <div className="px-4 py-10 pb-24">
        <EmptyState
          icon={<Wallet className="size-6" aria-hidden />}
          title="עדיין אין סירה"
          description="אחרי שתקימו סירה ותצרפו את השותפים, כל ההוצאות והיתרות יופיעו כאן."
        />
      </div>
    );
  }

  // Before reading the pending list, not after: the horizon only reaches 120
  // days past whenever a standing order was last created, so without this the
  // upcoming payments quietly run out and the screen shows nothing due.
  await topUpOccurrences(boat.id);

  const [members, balances, expenses, transfers, recurring, upcoming] = await Promise.all([
    getMembers(boat.id),
    getBalances(boat.id),
    getExpenses(boat.id),
    getTransfers(boat.id),
    getRecurringPayments(boat.id),
    getUpcomingPayments(boat.id),
  ]);

  return (
    // Bottom padding clears the floating + button, not just the nav. pb-24 left
    // the last card's actions sitting under it, unreachable.
    <div className="mx-auto w-full max-w-lg pb-[calc(var(--nav-height)+5.5rem)]">
      <PageHeader title="כספים" />

      <div className="px-4">
        <FinancesScreen
          boatId={boat.id}
          boatName={boat.name}
          currentUserId={user?.id ?? null}
          initialTab={initialTab}
          openNewExpense={newParam === "expense"}
          members={members.map((m) => ({
            userId: m.userId,
            name: m.name,
            color: m.color,
          }))}
          balances={balances}
          expenses={expenses}
          transfers={transfers}
          recurring={recurring}
          upcoming={upcoming}
        />
      </div>
    </div>
  );
}
