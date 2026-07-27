"use client";

import { useMemo } from "react";
import { CalendarClock, ChevronLeft, Scale, Share2, TrendingUp } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { headlineSettlement, suggestSettlements } from "@/lib/balance";
import { expenseCategoryLabel } from "@/lib/constants";
import { formatAgorot, formatMonthYear, formatRelativeDays } from "@/lib/format";
import { balanceMessage, share } from "@/lib/whatsapp";
import { Sparkline } from "./sparkline";
import { memberNameMap, type FinanceBalance, type FinanceExpense, type FinanceMember, type FinanceOccurrence, type FinanceTab } from "./types";

const monthKeyOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

/**
 * `spent_on` is a Postgres `date` ("2026-07-01"), and `new Date()` would read it
 * as UTC midnight — which lands in the previous month for anyone west of UTC.
 * Take the calendar month straight off the string instead.
 */
const monthKeyOfDate = (value: string) => value.slice(0, 7);

export function OverviewTab({
  boatName,
  members,
  balances,
  expenses,
  upcoming,
  onNavigate,
}: {
  boatName: string;
  members: FinanceMember[];
  balances: FinanceBalance[];
  expenses: FinanceExpense[];
  upcoming: FinanceOccurrence[];
  onNavigate: (tab: FinanceTab) => void;
}) {
  const names = useMemo(() => memberNameMap(members), [members]);
  const headline = useMemo(() => headlineSettlement(balances), [balances]);

  const { months, monthTotals, currentTotal, currentLabel, categories } = useMemo(() => {
    const now = new Date();
    const keys: string[] = [];
    const labels: Date[] = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      keys.push(monthKeyOf(date));
      labels.push(date);
    }

    const totals = new Map<string, number>(keys.map((key) => [key, 0]));
    const thisMonth = keys[keys.length - 1];
    const byCategory = new Map<string, number>();

    for (const expense of expenses) {
      const key = monthKeyOfDate(expense.spentOn);
      if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + expense.amountAgorot);
      if (key === thisMonth) {
        byCategory.set(
          expense.category,
          (byCategory.get(expense.category) ?? 0) + expense.amountAgorot,
        );
      }
    }

    const top = [...byCategory.entries()]
      .map(([category, amountAgorot]) => ({ category, amountAgorot }))
      .sort((a, b) => b.amountAgorot - a.amountAgorot)
      .slice(0, 5);

    return {
      months: labels,
      monthTotals: keys.map((key) => totals.get(key) ?? 0),
      currentTotal: totals.get(thisMonth) ?? 0,
      currentLabel: formatMonthYear(labels[labels.length - 1]),
      categories: top,
    };
  }, [expenses]);

  const categoryMax = categories[0]?.amountAgorot ?? 0;
  const nextPayments = upcoming.slice(0, 3);

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------------- */}
      <Card className="bg-gradient-to-b from-hull-800 to-hull-850">
        <div className="flex items-center gap-2 text-ink-muted">
          <Scale className="size-4 text-teal-400" aria-hidden />
          <h2 className="text-sm font-medium">יתרה בין שותפים</h2>
        </div>

        {headline ? (
          <div className="mt-3">
            <p className="text-sm text-ink-muted">
              {names[headline.fromUser] ?? "שותף"} חייב ל{names[headline.toUser] ?? "שותף"}
            </p>
            <p className="numeric mt-0.5 text-4xl font-bold text-teal-400">
              {formatAgorot(headline.amountAgorot)}
            </p>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-teal-400/15 text-teal-400">
              <Scale className="size-5" aria-hidden />
            </span>
            <p className="text-lg font-semibold text-teal-400">כולם מאוזנים</p>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => onNavigate("transfers")}>
            פירוט מלא
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Share2 className="size-4" aria-hidden />}
            onClick={() =>
              void share(
                balanceMessage(boatName, balances, suggestSettlements(balances), names),
              )
            }
          >
            שיתוף
          </Button>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardTitle>הוצאות החודש</CardTitle>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="numeric text-3xl font-bold">{formatAgorot(currentTotal)}</p>
            <p className="mt-0.5 text-xs text-ink-subtle">{currentLabel}</p>
          </div>
          <TrendingUp className="size-4 text-teal-400" aria-hidden />
        </div>

        <div className="mt-3">
          <Sparkline values={monthTotals} />
          <div className="mt-1 flex justify-between text-[10px] text-ink-subtle" dir="ltr">
            {months.map((month) => (
              <span key={month.toISOString()}>
                {month.toLocaleDateString("he-IL", { month: "short" })}
              </span>
            ))}
          </div>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardTitle
          action={
            <button
              type="button"
              onClick={() => onNavigate("expenses")}
              className="flex items-center gap-0.5 text-xs font-medium text-teal-400 transition hover:text-teal-500"
            >
              צפייה בכל ההוצאות
              <ChevronLeft className="size-3.5" aria-hidden />
            </button>
          }
        >
          קטגוריות מובילות
        </CardTitle>

        {categories.length === 0 ? (
          <p className="py-2 text-xs text-ink-subtle">אין עדיין הוצאות בחודש הזה</p>
        ) : (
          <ul className="space-y-3">
            {categories.map((entry, index) => {
              // Share of the whole month, not of the five rows shown — with more
              // than five categories the latter would add up to a false 100%.
              const percent = currentTotal > 0 ? (entry.amountAgorot / currentTotal) * 100 : 0;
              const width = categoryMax > 0 ? (entry.amountAgorot / categoryMax) * 100 : 0;
              return (
                <li key={entry.category}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm">
                      {expenseCategoryLabel(entry.category)}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span className="numeric text-xs text-ink-subtle">
                        {Math.round(percent)}%
                      </span>
                      <span className="numeric text-sm font-semibold">
                        {formatAgorot(entry.amountAgorot)}
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-hull-750">
                    <div
                      className={
                        index === 0
                          ? "h-full rounded-full bg-teal-400"
                          : "h-full rounded-full bg-teal-400/40"
                      }
                      style={{ width: `${Math.max(width, 3)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardTitle
          action={
            <button
              type="button"
              onClick={() => onNavigate("recurring")}
              className="flex items-center gap-0.5 text-xs font-medium text-teal-400 transition hover:text-teal-500"
            >
              לכל ההוראות
              <ChevronLeft className="size-3.5" aria-hidden />
            </button>
          }
        >
          תשלומים קרובים (הוראות קבע)
        </CardTitle>

        {nextPayments.length === 0 ? (
          <p className="py-2 text-xs text-ink-subtle">אין תשלומים ממתינים</p>
        ) : (
          <ul className="space-y-2">
            {nextPayments.map((payment) => (
              <li
                key={payment.id}
                className="flex items-center gap-3 rounded-tile bg-hull-750/60 px-3 py-2"
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-hull-800 text-teal-400">
                  <CalendarClock className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{payment.title}</p>
                  <p className="text-xs text-ink-subtle">
                    {formatRelativeDays(payment.dueOn)}
                  </p>
                </div>
                <span className="numeric text-sm font-semibold">
                  {formatAgorot(payment.amountAgorot)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 flex justify-end">
          <Badge tone="neutral">לא משפיע על היתרות עד לאישור</Badge>
        </p>
      </Card>
    </div>
  );
}
