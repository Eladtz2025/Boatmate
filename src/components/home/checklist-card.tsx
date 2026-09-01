"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ListChecks, Plus, Trash2 } from "lucide-react";
import { createTask, deleteTask, setTaskDone } from "@/app/actions";
import type { TaskRow } from "@/lib/data";
import { cn } from "@/lib/cn";
import { TileLabel } from "@/components/ui/card";
import { ErrorNote } from "@/components/ui/empty-state";

/**
 * The boat's shared checklist. One list, every partner, nothing else — no
 * assignee, no due date, no priority, no category. It is the thing a crew
 * actually keeps: "פנס אחורי", "למלא מים", "לקנות חבל 12 מ׳".
 *
 * It writes to the existing `tasks` table, which already had `title` and
 * `done` and was only ever read as "open tasks" on the home screen. RLS makes
 * it shared for free: every partner of the boat can read and write every row,
 * so two people see the same list without any extra plumbing.
 *
 * Optimistic on every interaction, because a checklist that waits for a round
 * trip before ticking feels broken. `overrides` and `drafts` are cleared the
 * moment fresh server rows arrive — `items` is a new array on each server
 * render, which is exactly the signal we want.
 */

type Override = { done?: boolean; deleted?: boolean };

export function ChecklistCard({
  boatId,
  items,
  className,
}: {
  boatId: string;
  items: TaskRow[];
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());
  const [drafts, setDrafts] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Server truth has landed: the local guesses have done their job. Adjusted
  // during render rather than in an effect — this is the "reset state when a
  // prop changes" pattern, and an effect here would cost an extra commit and a
  // frame in which the optimistic row and the real one are both on screen.
  const [seen, setSeen] = useState(items);
  if (seen !== items) {
    setSeen(items);
    setOverrides(new Map());
    setDrafts([]);
  }

  function override(id: string, patch: Override) {
    setOverrides((current) => {
      const next = new Map(current);
      next.set(id, { ...next.get(id), ...patch });
      return next;
    });
  }

  function undo(id: string, key: keyof Override) {
    setOverrides((current) => {
      const next = new Map(current);
      const entry = { ...next.get(id) };
      delete entry[key];
      next.set(id, entry);
      return next;
    });
  }

  function toggle(item: TaskRow, done: boolean) {
    setError(null);
    override(item.id, { done });

    startTransition(async () => {
      const result = await setTaskDone(item.id, done);
      if (!result.ok) {
        undo(item.id, "done");
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function remove(item: TaskRow) {
    setError(null);
    override(item.id, { deleted: true });

    startTransition(async () => {
      const result = await deleteTask(item.id);
      if (!result.ok) {
        undo(item.id, "deleted");
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function add(event: React.FormEvent) {
    event.preventDefault();
    const text = title.trim();
    if (!text) return;

    setError(null);
    setTitle("");
    setDrafts((current) => [...current, text]);
    // Adding several things in a row is the normal case, so the field keeps
    // the caret rather than making you tap back into it each time.
    inputRef.current?.focus();

    startTransition(async () => {
      const result = await createTask({ boatId, title: text });
      if (!result.ok) {
        setDrafts((current) => {
          const next = [...current];
          const at = next.lastIndexOf(text);
          if (at >= 0) next.splice(at, 1);
          return next;
        });
        setTitle(text);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const rows = items
    .filter((item) => !overrides.get(item.id)?.deleted)
    .map((item) => ({ ...item, done: overrides.get(item.id)?.done ?? item.done }));

  const openCount = rows.filter((row) => !row.done).length + drafts.length;

  return (
    <div className={cn("card flex flex-col gap-2 p-4", className)}>
      <div className="flex items-center justify-between">
        <TileLabel>הרשימה של הסירה</TileLabel>
        <span className="flex items-center gap-1.5 text-ink-subtle">
          {openCount > 0 && (
            <span className="numeric text-[11px] font-medium">{openCount}</span>
          )}
          <ListChecks className="size-4" aria-hidden />
        </span>
      </div>

      {rows.length === 0 && drafts.length === 0 ? (
        <p className="py-2 text-xs text-ink-subtle">
          הרשימה ריקה. אפשר להוסיף פריט למטה.
        </p>
      ) : (
        <ul className="no-scrollbar -mx-1 max-h-40 space-y-0.5 overflow-y-auto px-1">
          {rows.map((item) => (
            <li key={item.id} className="group flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggle(item, !item.done)}
                aria-pressed={item.done}
                aria-label={item.done ? `ביטול סימון ${item.title}` : `סימון ${item.title}`}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-start"
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border transition",
                    item.done
                      ? "border-teal-400 bg-teal-400 text-hull-950"
                      : "border-ink-subtle",
                  )}
                >
                  {item.done && <Check className="size-3" aria-hidden />}
                </span>
                <span
                  className={cn(
                    "truncate text-sm transition",
                    item.done
                      ? "text-ink-subtle line-through"
                      : "text-ink",
                  )}
                >
                  {item.title}
                </span>
              </button>

              <button
                type="button"
                onClick={() => remove(item)}
                aria-label={`מחיקת ${item.title}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-subtle transition hover:bg-hull-750 hover:text-danger"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}

          {/* Optimistic rows: visibly on their way, not yet tickable. */}
          {drafts.map((text, index) => (
            <li
              key={`draft-${index}`}
              className="flex min-h-11 items-center gap-2.5 opacity-50"
            >
              <span className="size-5 shrink-0 rounded-full border border-ink-subtle" />
              <span className="truncate text-sm text-ink">{text}</span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="הוספת פריט…"
          aria-label="הוספת פריט לרשימה"
          enterKeyHint="done"
          className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--hairline)] bg-hull-750 px-3 text-sm text-ink placeholder:text-ink-subtle focus:border-teal-400/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!title.trim() || pending}
          aria-label="הוספה"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-400 text-hull-950 transition active:scale-95 hover:bg-teal-500 disabled:bg-teal-400/30"
        >
          <Plus className="size-5" aria-hidden />
        </button>
      </form>

      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
