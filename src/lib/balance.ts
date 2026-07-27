/**
 * Boatmate balance engine.
 *
 * Every amount here is an integer number of agorot (1/100 ₪). Money never
 * touches a float — splitting 1000 agorot three ways must give back exactly
 * 1000 agorot, and only integer arithmetic guarantees that.
 *
 * Sign convention, used everywhere in the app:
 *   balance > 0  →  the group owes this partner (they are "in credit")
 *   balance < 0  →  this partner owes the group
 *
 * The four inputs to a balance:
 *   paid      what the partner laid out for the boat
 *   owed      the partner's share of everything the boat spent
 *   sent      settlement transfers the partner sent to someone
 *   received  settlement transfers the partner received
 *
 *   balance = paid − owed − received + sent
 *
 * Pending standing orders deliberately appear nowhere in this file: a
 * recurring payment only affects balances once it has been confirmed paid,
 * at which point it has become an ordinary expense.
 */

export type Agorot = number;

export interface ExpenseInput {
  id: string;
  paidBy: string;
  amountAgorot: Agorot;
  /** Must sum to amountAgorot. Enforced in the DB by a deferred constraint. */
  shares: Array<{ userId: string; shareAgorot: Agorot }>;
}

export interface TransferInput {
  id: string;
  fromUser: string;
  toUser: string;
  amountAgorot: Agorot;
}

export interface MemberBalance {
  userId: string;
  paidAgorot: Agorot;
  owedAgorot: Agorot;
  sentAgorot: Agorot;
  receivedAgorot: Agorot;
  /** paid − owed − received + sent */
  balanceAgorot: Agorot;
}

export interface Settlement {
  fromUser: string;
  toUser: string;
  amountAgorot: Agorot;
}

/* -------------------------------------------------------------------------- */
/* Splitting                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Split an amount equally, distributing the indivisible remainder one agora at
 * a time. `userIds` order decides who absorbs the extra agorot, so callers
 * should pass a stable order (we sort by user id) to keep results reproducible.
 *
 *   splitEqual(1000, [a, b, c]) → 334, 333, 333
 */
export function splitEqual(
  amountAgorot: Agorot,
  userIds: string[],
): Array<{ userId: string; shareAgorot: Agorot }> {
  assertWholeAgorot(amountAgorot, "amountAgorot");
  if (userIds.length === 0) {
    throw new Error("splitEqual needs at least one partner");
  }

  const ordered = [...userIds].sort();
  const base = Math.floor(amountAgorot / ordered.length);
  let remainder = amountAgorot - base * ordered.length;

  return ordered.map((userId) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { userId, shareAgorot: base + extra };
  });
}

/**
 * Split by percentage. Percentages are given as numbers (33.3 means 33.3%) and
 * need not be exact — the largest-remainder method assigns every agora so the
 * shares always add back up to the full amount.
 */
export function splitByPercent(
  amountAgorot: Agorot,
  weights: Array<{ userId: string; percent: number }>,
): Array<{ userId: string; shareAgorot: Agorot }> {
  assertWholeAgorot(amountAgorot, "amountAgorot");
  if (weights.length === 0) {
    throw new Error("splitByPercent needs at least one partner");
  }

  const total = weights.reduce((sum, w) => sum + w.percent, 0);
  if (total <= 0) {
    throw new Error("Percentages must add up to more than zero");
  }

  const exact = weights.map((w) => ({
    userId: w.userId,
    ideal: (amountAgorot * w.percent) / total,
  }));

  const floored = exact.map((e) => ({
    userId: e.userId,
    shareAgorot: Math.floor(e.ideal),
    remainder: e.ideal - Math.floor(e.ideal),
  }));

  let leftover =
    amountAgorot - floored.reduce((sum, f) => sum + f.shareAgorot, 0);

  // Largest fractional remainder wins the spare agorot; ties break on user id
  // so the result is deterministic.
  const order = [...floored].sort(
    (a, b) => b.remainder - a.remainder || a.userId.localeCompare(b.userId),
  );

  for (const entry of order) {
    if (leftover <= 0) break;
    entry.shareAgorot += 1;
    leftover -= 1;
  }

  return floored.map(({ userId, shareAgorot }) => ({ userId, shareAgorot }));
}

/**
 * Validate a hand-entered custom split. Returns the difference from the target
 * so the UI can show "‏₪12 left to assign" rather than silently rounding.
 */
export function customSplitDelta(
  amountAgorot: Agorot,
  shares: Array<{ userId: string; shareAgorot: Agorot }>,
): Agorot {
  const total = shares.reduce((sum, s) => sum + s.shareAgorot, 0);
  return amountAgorot - total;
}

/* -------------------------------------------------------------------------- */
/* Balances                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Compute every partner's balance. Members with no activity are still
 * returned (at zero) so the UI can list the whole crew.
 */
export function computeBalances(
  memberIds: string[],
  expenses: ExpenseInput[],
  transfers: TransferInput[],
): MemberBalance[] {
  const rows = new Map<string, MemberBalance>();

  const row = (userId: string): MemberBalance => {
    let existing = rows.get(userId);
    if (!existing) {
      existing = {
        userId,
        paidAgorot: 0,
        owedAgorot: 0,
        sentAgorot: 0,
        receivedAgorot: 0,
        balanceAgorot: 0,
      };
      rows.set(userId, existing);
    }
    return existing;
  };

  for (const id of memberIds) row(id);

  for (const expense of expenses) {
    row(expense.paidBy).paidAgorot += expense.amountAgorot;
    for (const share of expense.shares) {
      row(share.userId).owedAgorot += share.shareAgorot;
    }
  }

  for (const transfer of transfers) {
    row(transfer.fromUser).sentAgorot += transfer.amountAgorot;
    row(transfer.toUser).receivedAgorot += transfer.amountAgorot;
  }

  for (const entry of rows.values()) {
    entry.balanceAgorot =
      entry.paidAgorot -
      entry.owedAgorot -
      entry.receivedAgorot +
      entry.sentAgorot;
  }

  return [...rows.values()].sort((a, b) => b.balanceAgorot - a.balanceAgorot);
}

/**
 * Reduce the balances to the fewest transfers that clear them.
 *
 * Greedy largest-debtor-pays-largest-creditor. For a boat with a handful of
 * partners this is optimal in practice and always produces at most n−1
 * transfers.
 */
export function suggestSettlements(balances: MemberBalance[]): Settlement[] {
  const creditors = balances
    .filter((b) => b.balanceAgorot > 0)
    .map((b) => ({ userId: b.userId, amount: b.balanceAgorot }))
    .sort((a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId));

  const debtors = balances
    .filter((b) => b.balanceAgorot < 0)
    .map((b) => ({ userId: b.userId, amount: -b.balanceAgorot }))
    .sort((a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId));

  const settlements: Settlement[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.amount, debtor.amount);

    if (amount > 0) {
      settlements.push({
        fromUser: debtor.userId,
        toUser: creditor.userId,
        amountAgorot: amount,
      });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount === 0) ci += 1;
    if (debtor.amount === 0) di += 1;
  }

  return settlements;
}

/**
 * The single headline the home screen shows, e.g. "אלעד חייב לדני ₪1,240".
 * Returns null when everyone is square.
 */
export function headlineSettlement(
  balances: MemberBalance[],
): Settlement | null {
  const settlements = suggestSettlements(balances);
  if (settlements.length === 0) return null;
  return settlements.reduce((biggest, s) =>
    s.amountAgorot > biggest.amountAgorot ? s : biggest,
  );
}

/* -------------------------------------------------------------------------- */

function assertWholeAgorot(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${label} must be a whole number of agorot, got ${value}`);
  }
  if (value < 0) {
    throw new Error(`${label} must not be negative, got ${value}`);
  }
}
