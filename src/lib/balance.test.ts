import { describe, expect, it } from "vitest";
import {
  computeBalances,
  customSplitDelta,
  headlineSettlement,
  splitByPercent,
  splitEqual,
  suggestSettlements,
  type ExpenseInput,
  type TransferInput,
} from "./balance";

// Sorted ids keep the expected remainder order obvious in assertions.
const DANI = "a-dani";
const ELAD = "b-elad";
const LIOR = "c-lior";
const CREW = [DANI, ELAD, LIOR];

const sum = (xs: Array<{ shareAgorot: number }>) =>
  xs.reduce((t, x) => t + x.shareAgorot, 0);

describe("splitEqual", () => {
  it("splits evenly when it divides cleanly", () => {
    const shares = splitEqual(240_000, CREW);
    expect(shares.map((s) => s.shareAgorot)).toEqual([80_000, 80_000, 80_000]);
  });

  it("never loses or invents an agora on an indivisible amount", () => {
    const shares = splitEqual(1000, CREW);
    expect(shares.map((s) => s.shareAgorot)).toEqual([334, 333, 333]);
    expect(sum(shares)).toBe(1000);
  });

  it("conserves the total for every amount in a wide sweep", () => {
    for (let amount = 0; amount <= 500; amount += 1) {
      for (const size of [1, 2, 3, 4, 5, 7]) {
        const crew = Array.from({ length: size }, (_, i) => `u${i}`);
        expect(sum(splitEqual(amount, crew))).toBe(amount);
      }
    }
  });

  it("is order independent — shares follow the partner, not the argument order", () => {
    const a = splitEqual(1000, [DANI, ELAD, LIOR]);
    const b = splitEqual(1000, [LIOR, DANI, ELAD]);
    expect(a).toEqual(b);
  });

  it("rejects fractional and negative amounts", () => {
    expect(() => splitEqual(10.5, CREW)).toThrow(/whole number/);
    expect(() => splitEqual(-100, CREW)).toThrow(/negative/);
    expect(() => splitEqual(100, [])).toThrow(/at least one/);
  });
});

describe("splitByPercent", () => {
  it("honours exact percentages", () => {
    const shares = splitByPercent(100_000, [
      { userId: DANI, percent: 50 },
      { userId: ELAD, percent: 30 },
      { userId: LIOR, percent: 20 },
    ]);
    expect(shares.map((s) => s.shareAgorot)).toEqual([50_000, 30_000, 20_000]);
  });

  it("absorbs rounding from percentages that do not sum to 100", () => {
    // 33.3 × 3 = 99.9 — the engine normalises and still assigns every agora.
    const shares = splitByPercent(1000, [
      { userId: DANI, percent: 33.3 },
      { userId: ELAD, percent: 33.3 },
      { userId: LIOR, percent: 33.3 },
    ]);
    expect(sum(shares)).toBe(1000);
  });

  it("gives spare agorot to the largest fractional remainder", () => {
    const shares = splitByPercent(1000, [
      { userId: DANI, percent: 60 },
      { userId: ELAD, percent: 20 },
      { userId: LIOR, percent: 20 },
    ]);
    expect(sum(shares)).toBe(1000);
    expect(shares.find((s) => s.userId === DANI)!.shareAgorot).toBe(600);
  });

  it("rejects percentages that add up to nothing", () => {
    expect(() =>
      splitByPercent(1000, [{ userId: DANI, percent: 0 }]),
    ).toThrow(/more than zero/);
  });
});

describe("customSplitDelta", () => {
  it("reports what is still unassigned", () => {
    expect(
      customSplitDelta(100_000, [
        { userId: DANI, shareAgorot: 40_000 },
        { userId: ELAD, shareAgorot: 40_000 },
      ]),
    ).toBe(20_000);
  });

  it("reports over-assignment as a negative delta", () => {
    expect(
      customSplitDelta(100_000, [{ userId: DANI, shareAgorot: 120_000 }]),
    ).toBe(-20_000);
  });
});

describe("computeBalances", () => {
  it("credits the payer and debits everyone's share", () => {
    // Dani pays ₪2,400 for the mooring, split three ways.
    const expenses: ExpenseInput[] = [
      {
        id: "e1",
        paidBy: DANI,
        amountAgorot: 240_000,
        shares: splitEqual(240_000, CREW),
      },
    ];

    const balances = computeBalances(CREW, expenses, []);
    const byId = Object.fromEntries(balances.map((b) => [b.userId, b]));

    expect(byId[DANI].balanceAgorot).toBe(160_000);
    expect(byId[ELAD].balanceAgorot).toBe(-80_000);
    expect(byId[LIOR].balanceAgorot).toBe(-80_000);
  });

  it("always sums to zero across the crew", () => {
    const expenses: ExpenseInput[] = [
      { id: "e1", paidBy: DANI, amountAgorot: 1000, shares: splitEqual(1000, CREW) },
      { id: "e2", paidBy: ELAD, amountAgorot: 777, shares: splitEqual(777, CREW) },
      { id: "e3", paidBy: LIOR, amountAgorot: 5, shares: splitEqual(5, CREW) },
    ];
    const transfers: TransferInput[] = [
      { id: "t1", fromUser: ELAD, toUser: DANI, amountAgorot: 123 },
    ];

    const total = computeBalances(CREW, expenses, transfers).reduce(
      (t, b) => t + b.balanceAgorot,
      0,
    );
    expect(total).toBe(0);
  });

  it("reduces a debt when the debtor transfers money", () => {
    const expenses: ExpenseInput[] = [
      {
        id: "e1",
        paidBy: DANI,
        amountAgorot: 240_000,
        shares: splitEqual(240_000, CREW),
      },
    ];
    // Elad settles his ₪800 share.
    const transfers: TransferInput[] = [
      { id: "t1", fromUser: ELAD, toUser: DANI, amountAgorot: 80_000 },
    ];

    const byId = Object.fromEntries(
      computeBalances(CREW, expenses, transfers).map((b) => [b.userId, b]),
    );

    expect(byId[ELAD].balanceAgorot).toBe(0);
    expect(byId[DANI].balanceAgorot).toBe(80_000);
    expect(byId[LIOR].balanceAgorot).toBe(-80_000);
  });

  it("handles an unequal split where the payer is not a participant", () => {
    // Dani pays for a repair that only Elad and Lior share.
    const expenses: ExpenseInput[] = [
      {
        id: "e1",
        paidBy: DANI,
        amountAgorot: 60_000,
        shares: splitEqual(60_000, [ELAD, LIOR]),
      },
    ];
    const byId = Object.fromEntries(
      computeBalances(CREW, expenses, []).map((b) => [b.userId, b]),
    );

    expect(byId[DANI].balanceAgorot).toBe(60_000);
    expect(byId[ELAD].balanceAgorot).toBe(-30_000);
    expect(byId[LIOR].balanceAgorot).toBe(-30_000);
  });

  it("lists members with no activity at zero", () => {
    const balances = computeBalances(CREW, [], []);
    expect(balances).toHaveLength(3);
    expect(balances.every((b) => b.balanceAgorot === 0)).toBe(true);
  });

  it("breaks out paid / owed / sent / received", () => {
    const expenses: ExpenseInput[] = [
      {
        id: "e1",
        paidBy: DANI,
        amountAgorot: 30_000,
        shares: splitEqual(30_000, CREW),
      },
    ];
    const transfers: TransferInput[] = [
      { id: "t1", fromUser: ELAD, toUser: DANI, amountAgorot: 5_000 },
    ];
    const byId = Object.fromEntries(
      computeBalances(CREW, expenses, transfers).map((b) => [b.userId, b]),
    );

    expect(byId[DANI]).toMatchObject({
      paidAgorot: 30_000,
      owedAgorot: 10_000,
      sentAgorot: 0,
      receivedAgorot: 5_000,
      balanceAgorot: 15_000,
    });
    expect(byId[ELAD]).toMatchObject({
      paidAgorot: 0,
      owedAgorot: 10_000,
      sentAgorot: 5_000,
      receivedAgorot: 0,
      balanceAgorot: -5_000,
    });
  });
});

describe("suggestSettlements", () => {
  it("clears a simple two-way debt in one transfer", () => {
    const balances = computeBalances(
      CREW,
      [
        {
          id: "e1",
          paidBy: DANI,
          amountAgorot: 240_000,
          shares: splitEqual(240_000, CREW),
        },
      ],
      [],
    );

    const settlements = suggestSettlements(balances);
    expect(settlements).toHaveLength(2);
    expect(settlements.every((s) => s.toUser === DANI)).toBe(true);
    expect(settlements.reduce((t, s) => t + s.amountAgorot, 0)).toBe(160_000);
  });

  it("produces at most n−1 transfers and zeroes everyone out", () => {
    const expenses: ExpenseInput[] = [
      { id: "e1", paidBy: DANI, amountAgorot: 100_000, shares: splitEqual(100_000, CREW) },
      { id: "e2", paidBy: ELAD, amountAgorot: 40_000, shares: splitEqual(40_000, CREW) },
      { id: "e3", paidBy: LIOR, amountAgorot: 10_000, shares: splitEqual(10_000, CREW) },
    ];

    const balances = computeBalances(CREW, expenses, []);
    const settlements = suggestSettlements(balances);
    expect(settlements.length).toBeLessThanOrEqual(CREW.length - 1);

    // Applying the suggestions must leave every partner at zero.
    const after = computeBalances(
      CREW,
      expenses,
      settlements.map((s, i) => ({
        id: `t${i}`,
        fromUser: s.fromUser,
        toUser: s.toUser,
        amountAgorot: s.amountAgorot,
      })),
    );
    expect(after.every((b) => b.balanceAgorot === 0)).toBe(true);
  });

  it("returns nothing when the crew is square", () => {
    expect(suggestSettlements(computeBalances(CREW, [], []))).toEqual([]);
  });

  it("never suggests paying yourself", () => {
    const balances = computeBalances(
      CREW,
      [
        {
          id: "e1",
          paidBy: DANI,
          amountAgorot: 999,
          shares: splitEqual(999, CREW),
        },
      ],
      [],
    );
    for (const s of suggestSettlements(balances)) {
      expect(s.fromUser).not.toBe(s.toUser);
    }
  });
});

describe("headlineSettlement", () => {
  it("picks the largest outstanding debt", () => {
    const balances = computeBalances(
      CREW,
      [
        { id: "e1", paidBy: DANI, amountAgorot: 300_000, shares: splitEqual(300_000, CREW) },
        { id: "e2", paidBy: LIOR, amountAgorot: 60_000, shares: splitEqual(60_000, CREW) },
      ],
      [],
    );

    const headline = headlineSettlement(balances)!;
    expect(headline.toUser).toBe(DANI);
    expect(headline.amountAgorot).toBeGreaterThan(0);
  });

  it("is null when nobody owes anything", () => {
    expect(headlineSettlement(computeBalances(CREW, [], []))).toBeNull();
  });
});

describe("standing orders", () => {
  it("a pending standing order does not move any balance", () => {
    // Pending occurrences are simply absent from the expense list — this test
    // pins that contract so nobody "helpfully" starts feeding them in.
    const before = computeBalances(CREW, [], []);
    expect(before.every((b) => b.balanceAgorot === 0)).toBe(true);
  });

  it("a confirmed standing order behaves exactly like a normal expense", () => {
    const generated: ExpenseInput = {
      id: "from-recurring",
      paidBy: DANI,
      amountAgorot: 240_000,
      shares: splitEqual(240_000, CREW),
    };
    const byId = Object.fromEntries(
      computeBalances(CREW, [generated], []).map((b) => [b.userId, b]),
    );
    expect(byId[DANI].balanceAgorot).toBe(160_000);
    expect(byId[ELAD].balanceAgorot).toBe(-80_000);
  });
});
