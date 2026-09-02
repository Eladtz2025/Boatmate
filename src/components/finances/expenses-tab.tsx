"use client";

import { useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { expenseCategoryLabel } from "@/lib/constants";
import { formatAgorot, formatMonthYear, formatShortDate } from "@/lib/format";
import { CategoryTile } from "./category-icon";
import { ExpenseDetailSheet } from "./expense-detail-sheet";
import { memberIndex, type FinanceExpense, type FinanceMember } from "./types";

type MonthGroup = {
  key: string;
  label: string;
  totalAgorot: number;
  rows: FinanceExpense[];
};

export function ExpensesTab({
  expenses,
  members,
  boatName,
  onNewExpense,
}: {
  expenses: FinanceExpense[];
  members: FinanceMember[];
  boatName: string;
  onNewExpense: () => void;
}) {
  const byId = useMemo(() => memberIndex(members), [members]);
  const [selected, setSelected] = useState<FinanceExpense | null>(null);

  const groups = useMemo<MonthGroup[]>(() => {
    const map = new Map<string, MonthGroup>();

    for (const expense of expenses) {
      // `spentOn` is a Postgres `date` ("2026-07-01"); parsing it with `new Date`
      // would read it as UTC midnight and bucket it into the previous month for
      // anyone west of UTC. Read the calendar month off the string instead.
      const key = expense.spentOn.slice(0, 7);
      const [year, month] = key.split("-").map(Number);
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          label: formatMonthYear(new Date(year, month - 1, 1)),
          totalAgorot: 0,
          rows: [],
        };
        map.set(key, group);
      }
      group.totalAgorot += expense.amountAgorot;
      group.rows.push(expense);
    }

    return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [expenses]);

  if (expenses.length === 0) {
    return (
      <EmptyState
        icon={<Receipt className="size-7" aria-hidden />}
        title="עדיין אין הוצאות"
        description="כל הוצאה שתוסיפו תתחלק בין השותפים ותעדכן את היתרות."
        action={
          <Button size="sm" onClick={onNewExpense}>
            הוספת הוצאה
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.key}>
          <h3 className="sticky top-0 z-10 -mx-4 mb-2 flex items-baseline justify-between gap-3 bg-hull-900/95 px-4 py-2 backdrop-blur">
            <span className="text-sm font-medium text-ink-muted">{group.label}</span>
            <span className="numeric text-xs text-ink-subtle">
              {formatAgorot(group.totalAgorot)}
            </span>
          </h3>

          <ul className="card divide-y divide-[var(--hairline)] overflow-hidden p-0">
            {group.rows.map((expense) => {
              const payer = byId[expense.paidBy];
              return (
                <li key={expense.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(expense)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-start transition hover:bg-hull-750/40 active:scale-[0.995]"
                  >
                    <CategoryTile category={expense.category} />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {expense.description || expenseCategoryLabel(expense.category)}
                      </p>
                      <p className="flex items-center gap-2 text-xs text-ink-subtle">
                        <span className="numeric">{formatShortDate(expense.spentOn)}</span>
                        {expense.source === "recurring" && (
                          <Badge tone="teal">קבוע</Badge>
                        )}
                        {expense.source === "gmail" && <Badge>מייל</Badge>}
                      </p>
                    </div>

                    <Avatar
                      name={payer?.name ?? "שותף"}
                      color={payer?.color}
                      size="xs"
                    />
                    <span className="numeric shrink-0 text-sm font-semibold">
                      {formatAgorot(expense.amountAgorot)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {selected && (
        <ExpenseDetailSheet
          expense={selected}
          members={byId}
          boatName={boatName}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
