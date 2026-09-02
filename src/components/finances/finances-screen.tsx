"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Segmented } from "@/components/ui/chips";
import { InvoiceSync } from "./invoice-sync";
import { NewExpenseSheet } from "./new-expense-sheet";
import { OverviewTab } from "./overview-tab";
import { ExpensesTab } from "./expenses-tab";
import { TransfersTab } from "./transfers-tab";
import { RecurringTab } from "./recurring-tab";
import {
  FINANCE_TABS,
  type FinanceBalance,
  type FinanceExpense,
  type FinanceMember,
  type FinanceOccurrence,
  type FinanceRecurring,
  type FinanceTab,
  type FinanceTransfer,
} from "./types";

/**
 * The four finance views. The active one lives in `?tab=` so a partner can send
 * a link straight to, say, the standing orders — but switching is local state
 * plus history.replaceState, so tapping a tab never refetches the page.
 */
export function FinancesScreen({
  boatId,
  boatName,
  currentUserId,
  initialTab,
  openNewExpense,
  members,
  balances,
  expenses,
  transfers,
  recurring,
  upcoming,
}: {
  boatId: string;
  boatName: string;
  currentUserId: string | null;
  initialTab: FinanceTab;
  openNewExpense: boolean;
  members: FinanceMember[];
  balances: FinanceBalance[];
  expenses: FinanceExpense[];
  transfers: FinanceTransfer[];
  recurring: FinanceRecurring[];
  upcoming: FinanceOccurrence[];
}) {
  const [tab, setTab] = useState<FinanceTab>(initialTab);
  const [expenseSheet, setExpenseSheet] = useState(openNewExpense);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (tab === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    url.searchParams.delete("new");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [tab]);

  const openExpenseSheet = useCallback(() => setExpenseSheet(true), []);

  return (
    <>
      <Segmented<FinanceTab>
        options={FINANCE_TABS}
        value={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === "overview" && (
        <OverviewTab
          boatName={boatName}
          members={members}
          balances={balances}
          expenses={expenses}
          upcoming={upcoming}
          onNavigate={setTab}
        />
      )}

      {tab === "expenses" && (
        <div className="space-y-3">
          {/* Sits with the expenses, because that is where an imported invoice
              shows up. Nothing else on the screen changes when it runs. */}
          <InvoiceSync boatId={boatId} />
          <ExpensesTab
            expenses={expenses}
            members={members}
            boatName={boatName}
            onNewExpense={openExpenseSheet}
          />
        </div>
      )}

      {tab === "transfers" && (
        <TransfersTab
          boatId={boatId}
          members={members}
          balances={balances}
          transfers={transfers}
        />
      )}

      {tab === "recurring" && (
        <RecurringTab
          boatId={boatId}
          members={members}
          recurring={recurring}
          upcoming={upcoming}
          currentUserId={currentUserId}
        />
      )}

      {/* Floating action button, clear of the fixed bottom nav. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--nav-height)+1rem)] z-30 mx-auto flex max-w-lg justify-end px-4">
        <button
          type="button"
          onClick={openExpenseSheet}
          aria-label="הוצאה חדשה"
          className="pointer-events-auto inline-flex size-14 items-center justify-center rounded-full bg-teal-400 text-hull-950 shadow-lg shadow-teal-400/25 transition hover:bg-teal-500 active:scale-95"
        >
          <Plus className="size-6" aria-hidden />
        </button>
      </div>

      {expenseSheet && (
        <NewExpenseSheet
          onClose={() => setExpenseSheet(false)}
          boatId={boatId}
          boatName={boatName}
          members={members}
          currentUserId={currentUserId}
        />
      )}
    </>
  );
}
