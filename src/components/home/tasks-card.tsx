"use client";

import { useState, useTransition } from "react";
import { Check, ListTodo } from "lucide-react";
import { setTaskDone } from "@/app/actions";
import { TileLabel } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { TaskRow } from "@/lib/data";

export function TasksCard({ tasks }: { tasks: TaskRow[] }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    // Optimistic: the row greys out immediately, then the server catches up.
    setDone((current) => new Set(current).add(id));
    startTransition(async () => {
      const result = await setTaskDone(id, true);
      if (!result.ok) {
        setDone((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    });
  }

  const open = tasks.filter((task) => !done.has(task.id));

  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <TileLabel>משימות פתוחות</TileLabel>
        <ListTodo className="size-4 text-ink-subtle" aria-hidden />
      </div>

      {open.length === 0 ? (
        <p className="py-1 text-xs text-ink-subtle">אין משימות פתוחות</p>
      ) : (
        <>
          <p className="numeric text-sm font-semibold text-ink">
            {open.length} משימות
          </p>
          <ul className="space-y-1.5">
            {open.slice(0, 3).map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => toggle(task.id)}
                  className="flex w-full items-center gap-2 text-start text-xs text-ink-muted transition hover:text-ink disabled:opacity-60"
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border transition",
                      "border-ink-subtle hover:border-teal-400",
                    )}
                  >
                    <Check className="size-2.5 opacity-0 transition group-hover:opacity-100" aria-hidden />
                  </span>
                  <span className="truncate">{task.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
