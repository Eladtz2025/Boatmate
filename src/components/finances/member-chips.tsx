"use client";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import type { FinanceMember } from "./types";

/** Crew picker used for "שולם על ידי" — avatar chips, one selected. */
export function MemberChips({
  members,
  value,
  onChange,
  label,
}: {
  members: FinanceMember[];
  value: string | null;
  onChange: (userId: string) => void;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <div className="no-scrollbar flex gap-2 overflow-x-auto py-0.5">
        {members.map((member) => {
          const active = member.userId === value;
          return (
            <button
              key={member.userId}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(member.userId)}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-2 py-1.5 pe-3.5 text-sm transition",
                active
                  ? "border-teal-400 bg-teal-400/15 font-semibold text-teal-400"
                  : "border-[var(--hairline)] bg-hull-800 text-ink-muted hover:text-ink",
              )}
            >
              <Avatar name={member.name} color={member.color} size="xs" />
              <span className="whitespace-nowrap">{member.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
