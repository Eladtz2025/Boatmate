import { customSplitDelta, splitByPercent, splitEqual } from "@/lib/balance";
import { agorotToShekelInput, parseShekelInput } from "@/lib/format";
import type { SplitMode } from "@/lib/constants";
import type { SharePlan } from "@/app/actions";

/**
 * The split editor keeps raw text in state so typing "33." or "1200." never
 * fights the parser. Everything is converted to whole agorot only at the edges,
 * through the engine in lib/balance.ts.
 */
export type SplitState = {
  mode: SplitMode;
  /** userId → percent as typed, e.g. "33.3" */
  percents: Record<string, string>;
  /** userId → shekel amount as typed, e.g. "410.50" */
  amounts: Record<string, string>;
};

export function emptySplitState(mode: SplitMode = "equal"): SplitState {
  return { mode, percents: {}, amounts: {} };
}

const percentOf = (state: SplitState, userId: string, fallback: number) => {
  const raw = state.percents[userId];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 0;
};

const amountOf = (state: SplitState, userId: string) => {
  const raw = state.amounts[userId];
  if (raw === undefined || raw.trim() === "") return 0;
  return parseShekelInput(raw) ?? 0;
};

/** Never throws — an in-progress form is allowed to be nonsense. */
export function computeShares(
  amountAgorot: number,
  memberIds: string[],
  state: SplitState,
): Array<{ userId: string; shareAgorot: number }> {
  const zero = memberIds.map((userId) => ({ userId, shareAgorot: 0 }));
  if (memberIds.length === 0) return zero;

  if (state.mode === "custom") {
    return memberIds.map((userId) => ({ userId, shareAgorot: amountOf(state, userId) }));
  }

  if (!Number.isInteger(amountAgorot) || amountAgorot <= 0) return zero;

  try {
    if (state.mode === "equal") return splitEqual(amountAgorot, memberIds);

    const even = 100 / memberIds.length;
    const weights = memberIds.map((userId) => ({
      userId,
      percent: percentOf(state, userId, even),
    }));
    if (weights.reduce((sum, w) => sum + w.percent, 0) <= 0) return zero;
    return splitByPercent(amountAgorot, weights);
  } catch {
    return zero;
  }
}

/** How much of the expense is still unassigned. 0 means the form is valid. */
export function splitDelta(
  amountAgorot: number,
  memberIds: string[],
  state: SplitState,
): number {
  return customSplitDelta(amountAgorot, computeShares(amountAgorot, memberIds, state));
}

export function buildSharePlan(
  amountAgorot: number,
  memberIds: string[],
  state: SplitState,
): SharePlan {
  if (state.mode === "equal") return { mode: "equal", userIds: memberIds };

  if (state.mode === "percent") {
    const even = 100 / memberIds.length;
    return {
      mode: "percent",
      weights: memberIds.map((userId) => ({
        userId,
        percent: percentOf(state, userId, even),
      })),
    };
  }

  return {
    mode: "custom",
    shares: computeShares(amountAgorot, memberIds, state),
  };
}

/**
 * Switching mode seeds the new inputs from what is on screen right now, so the
 * amounts do not jump when the user moves from שווה to אחוזים.
 */
export function seedForMode(
  mode: SplitMode,
  amountAgorot: number,
  memberIds: string[],
  state: SplitState,
): SplitState {
  const current = computeShares(amountAgorot, memberIds, state);

  if (mode === "percent") {
    const even = (100 / Math.max(memberIds.length, 1)).toFixed(2);
    const percents: Record<string, string> = {};
    for (const share of current) {
      percents[share.userId] =
        amountAgorot > 0 ? ((share.shareAgorot / amountAgorot) * 100).toFixed(2) : even;
    }
    return { ...state, mode, percents };
  }

  if (mode === "custom") {
    const amounts: Record<string, string> = {};
    for (const share of current) {
      amounts[share.userId] = agorotToShekelInput(share.shareAgorot);
    }
    return { ...state, mode, amounts };
  }

  return { ...state, mode };
}
