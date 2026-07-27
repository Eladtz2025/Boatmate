"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEvent } from "@/app/actions";
import type { Member } from "@/lib/data";
import { EVENT_KINDS } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { ErrorNote } from "@/components/ui/empty-state";
import { DateInput, Field, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";

/**
 * `payment` rows in the calendar feed are projections of standing orders, so
 * the screen renders every `payment` item as a read-only link to /finances.
 * Offering it here would create an event nobody can ever open or delete.
 */
const CREATABLE_KINDS = EVENT_KINDS.filter((kind) => kind.value !== "payment");

/** yyyy-mm-dd + HH:mm, read as local time, handed to Postgres as an instant. */
function toInstant(date: string, time: string): string | null {
  const parsed = new Date(`${date}T${time || "00:00"}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function NewEventSheet({
  boatId,
  members,
  defaultDateKey,
  onClose,
}: {
  boatId: string;
  members: Member[];
  defaultDateKey: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<string>("usage");
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState(defaultDateKey);
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(defaultDateKey);
  const [endTime, setEndTime] = useState("17:00");
  const [location, setLocation] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const submit = () => {
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("צריך כותרת לאירוע");
      return;
    }
    if (!startDate) {
      setError("צריך תאריך התחלה");
      return;
    }

    const startsAt = toInstant(startDate, allDay ? "00:00" : startTime);
    if (!startsAt) {
      setError("תאריך או שעת ההתחלה אינם תקינים");
      return;
    }

    const endsAt = endDate ? toInstant(endDate, allDay ? "23:59" : endTime) : null;
    if (endDate && !endsAt) {
      setError("תאריך או שעת הסיום אינם תקינים");
      return;
    }

    if (endsAt && Date.parse(endsAt) < Date.parse(startsAt)) {
      setError("תאריך הסיום מוקדם מתאריך ההתחלה");
      return;
    }

    startTransition(async () => {
      const result = await createEvent({
        boatId,
        kind,
        title: trimmedTitle,
        startsAt,
        endsAt,
        allDay,
        location: location.trim() || null,
        notes: notes.trim() || null,
        userId: kind === "arrival" ? userId : null,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.refresh();
      onClose();
    });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="אירוע חדש"
      onConfirm={submit}
      confirmLabel="שמירה"
      busy={pending}
    >
      <div className="space-y-4">
        <SelectInput
          label="סוג"
          options={CREATABLE_KINDS}
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        />

        <TextInput
          label="כותרת"
          placeholder="הפלגה לנמל יפו"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />

        <div className="flex items-center justify-between rounded-2xl border border-[var(--hairline)] bg-hull-800 px-3.5 py-3">
          <span className="text-sm text-ink">כל היום</span>
          <button
            type="button"
            role="switch"
            aria-checked={allDay}
            aria-label="כל היום"
            onClick={() => setAllDay((value) => !value)}
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition",
              allDay ? "bg-teal-400" : "bg-hull-700",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-5 rounded-full bg-hull-950 transition-all",
                allDay ? "start-[1.375rem]" : "start-0.5",
              )}
            />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <DateInput
            label="תאריך התחלה"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
          {!allDay && (
            <TextInput
              label="שעת התחלה"
              type="time"
              dir="ltr"
              className="text-start"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          )}

          <DateInput
            label="תאריך סיום"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
          {!allDay && (
            <TextInput
              label="שעת סיום"
              type="time"
              dir="ltr"
              className="text-start"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          )}
        </div>

        <TextInput
          label="מיקום"
          placeholder="מרינה הרצליה"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        />

        {kind === "arrival" && members.length > 0 && (
          <Field label="שותף">
            <div className="no-scrollbar flex gap-2 overflow-x-auto py-1">
              {members.map((member) => {
                const active = member.userId === userId;
                return (
                  <button
                    key={member.userId}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setUserId(active ? null : member.userId)}
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-full border px-2 py-1.5 text-sm transition",
                      active
                        ? "border-teal-400 bg-teal-400/10 text-ink"
                        : "border-[var(--hairline)] bg-hull-800 text-ink-muted",
                    )}
                  >
                    <Avatar name={member.name} color={member.color} size="xs" />
                    {member.name}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        <TextArea
          label="הערות"
          placeholder="מה צריך להביא, מי מצטרף…"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Sheet>
  );
}
