"use client";

import { useMemo } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Segmented } from "@/components/ui/chips";
import { SPLIT_MODES, type SplitMode } from "@/lib/constants";
import { formatAgorot } from "@/lib/format";
import { computeShares, seedForMode, splitDelta, type SplitState } from "./split";
import type { FinanceMember } from "./types";

/**
 * "חלוקה בין שותפים" — one row per partner with the percentage and the
 * resulting amount. In שווה the rows are read-only; אחוזים lets you type a
 * percentage; סכום מותאם lets you type the amount and blocks confirmation
 * until every agora is assigned.
 */
export function SplitEditor({
  members,
  amountAgorot,
  state,
  onChange,
}: {
  members: FinanceMember[];
  amountAgorot: number;
  state: SplitState;
  onChange: (state: SplitState) => void;
}) {
  const memberIds = useMemo(() => members.map((m) => m.userId), [members]);
  const shares = useMemo(
    () => computeShares(amountAgorot, memberIds, state),
    [amountAgorot, memberIds, state],
  );
  const shareOf = useMemo(
    () => Object.fromEntries(shares.map((s) => [s.userId, s.shareAgorot])),
    [shares],
  );
  const delta = splitDelta(amountAgorot, memberIds, state);
  const evenPercent = 100 / Math.max(members.length, 1);

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-medium text-ink-muted">חלוקה בין שותפים</p>

      <Segmented<SplitMode>
        options={SPLIT_MODES}
        value={state.mode}
        onChange={(mode) => onChange(seedForMode(mode, amountAgorot, memberIds, state))}
      />

      <ul className="space-y-2">
        {members.map((member) => {
          const share = shareOf[member.userId] ?? 0;
          const percent =
            amountAgorot > 0 ? Math.round((share / amountAgorot) * 1000) / 10 : 0;

          return (
            <li
              key={member.userId}
              className="flex items-center gap-3 rounded-tile border border-[var(--hairline)] bg-hull-800 px-3 py-2"
            >
              <Avatar name={member.name} color={member.color} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm">{member.name}</span>

              {state.mode === "percent" ? (
                <div className="relative w-20 shrink-0">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    dir="ltr"
                    inputMode="decimal"
                    aria-label={`אחוז עבור ${member.name}`}
                    value={state.percents[member.userId] ?? evenPercent.toFixed(2)}
                    onChange={(event) =>
                      onChange({
                        ...state,
                        percents: {
                          ...state.percents,
                          [member.userId]: event.target.value,
                        },
                      })
                    }
                    className="numeric w-full rounded-xl border border-[var(--hairline)] bg-hull-750 py-1.5 pe-6 ps-2 text-sm text-ink outline-none transition focus:border-teal-400/50"
                  />
                  <span className="pointer-events-none absolute inset-y-0 end-2 flex items-center text-xs text-ink-subtle">
                    %
                  </span>
                </div>
              ) : (
                <span className="numeric w-12 shrink-0 text-end text-xs text-ink-subtle">
                  {percent}%
                </span>
              )}

              {state.mode === "custom" ? (
                <div className="relative w-24 shrink-0">
                  <span className="pointer-events-none absolute inset-y-0 start-2 flex items-center text-xs text-ink-subtle">
                    ₪
                  </span>
                  <input
                    type="text"
                    dir="ltr"
                    inputMode="decimal"
                    aria-label={`סכום עבור ${member.name}`}
                    value={state.amounts[member.userId] ?? ""}
                    onChange={(event) =>
                      onChange({
                        ...state,
                        amounts: {
                          ...state.amounts,
                          [member.userId]: event.target.value,
                        },
                      })
                    }
                    className="numeric w-full rounded-xl border border-[var(--hairline)] bg-hull-750 py-1.5 pe-2 ps-6 text-start text-sm font-medium text-ink outline-none transition focus:border-teal-400/50"
                  />
                </div>
              ) : (
                <span className="numeric w-20 shrink-0 text-end text-sm font-semibold">
                  {formatAgorot(share)}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {state.mode === "custom" && delta !== 0 && (
        <p className={delta > 0 ? "text-xs text-warning" : "text-xs text-danger"}>
          {delta > 0 ? (
            <>
              נותר לשייך <span className="numeric">{formatAgorot(delta)}</span>
            </>
          ) : (
            <>
              שויך יותר מדי — הפחיתו <span className="numeric">{formatAgorot(-delta)}</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}
