"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Moon, Share2, Sun, TriangleAlert, X } from "lucide-react";
import { clearAttendance, setAttendance } from "@/app/actions";
import { STAY_LABEL, type Attendance, type Stay } from "@/lib/attendance";
import type { Member } from "@/lib/data";
import { cn } from "@/lib/cn";
import { formatLongDate } from "@/lib/format";
import { attendanceMessage, share } from "@/lib/whatsapp";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { parseDayKey } from "./date-utils";

/**
 * Marking attendance: tap a day, tap "מגיע!", pick ליום or לינה, save.
 *
 * The full event form still exists for everything else on the calendar, but it
 * is not on this path — booking a Saturday should not mean filling in a title,
 * a start time, an end time and a location.
 *
 * Two things this screen refuses to be vague about:
 *
 * - **Editing is not adding.** A partner who already has the day marked lands
 *   straight on their current choice, and saving overwrites it. The action is
 *   idempotent on (boat, partner, day), so there is no path here that produces
 *   two rows for one person on one day.
 * - **Google sync is reported, not assumed.** The save succeeds or fails on
 *   the boat's own record alone; if the calendar leg failed, the panel says so
 *   in as many words instead of showing a tick over a calendar that never got
 *   the event.
 */

const STAY_OPTIONS: Array<{ value: Stay; Icon: typeof Sun; hint: string }> = [
  { value: "day", Icon: Sun, hint: "בוקר עד ערב" },
  { value: "overnight", Icon: Moon, hint: "לישון על הסירה" },
];

type Saved = {
  stay: Stay | null;
  cancelled: boolean;
  syncFailed: string | null;
};

export function AttendanceSheet({
  boatId,
  boatName,
  dateKey,
  members,
  currentUserId,
  attendance,
  onClose,
}: {
  boatId: string;
  boatName: string;
  dateKey: string;
  members: Member[];
  currentUserId: string;
  attendance: Attendance[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);

  const me = members.find((member) => member.userId === currentUserId);
  const mine = attendance.find((row) => row.userId === currentUserId) ?? null;
  const others = attendance.filter((row) => row.userId !== currentUserId);

  // Someone already coming starts on their current answer, so the sheet is an
  // edit rather than a fresh decision. Everyone else starts on "מגיע!".
  const [choosing, setChoosing] = useState(mine !== null);
  const [stay, setStay] = useState<Stay | null>(mine?.stay ?? null);

  const dateLabel = formatLongDate(parseDayKey(dateKey));
  const partnerName = me?.name ?? "שותף";

  function notify(nextStay: Stay | null, cancelled: boolean) {
    void share(
      attendanceMessage(boatName, {
        partnerName,
        stayLabel: nextStay ? STAY_LABEL[nextStay] : "",
        dateLabel,
        cancelled,
      }),
    );
  }

  function save() {
    if (!stay) return;
    setError(null);

    startTransition(async () => {
      const result = await setAttendance({
        boatId,
        dateKey,
        stay,
        partnerName,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.refresh();
      setSaved({
        stay,
        cancelled: false,
        syncFailed: result.sync.status === "failed" ? (result.sync.message ?? "") : null,
      });
    });
  }

  function cancel() {
    setError(null);

    startTransition(async () => {
      const result = await clearAttendance({ boatId, dateKey });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.refresh();
      setSaved({
        stay: null,
        cancelled: true,
        syncFailed: result.sync.status === "failed" ? (result.sync.message ?? "") : null,
      });
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Saved — what happened, and the one tap that tells the others            */
  /* ---------------------------------------------------------------------- */

  if (saved) {
    return (
      <Sheet open onClose={onClose} title={dateLabel}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-[var(--hairline)] bg-hull-800 p-3.5">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-tile",
                saved.cancelled
                  ? "bg-hull-750 text-ink-muted"
                  : "bg-teal-400/15 text-teal-400",
              )}
            >
              {saved.cancelled ? (
                <X className="size-5" aria-hidden />
              ) : (
                <Check className="size-5" aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                {saved.cancelled ? "ההגעה בוטלה" : "נשמר"}
              </p>
              <p className="text-xs text-ink-muted">
                {saved.cancelled
                  ? "השותפים כבר לא רואים אותך ביום הזה"
                  : `${partnerName} — ${STAY_LABEL[saved.stay ?? "day"]}`}
              </p>
            </div>
          </div>

          {/* Sync is a separate fact from the save, and it is said out loud.
              Silence here would be the app claiming a calendar entry exists. */}
          {saved.syncFailed && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                ההגעה נשמרה ב-Boatmate, אבל {saved.syncFailed}
              </span>
            </p>
          )}

          <p className="text-xs text-ink-subtle">
            השותפים רואים את השינוי באפליקציה. שליחת הודעה לקבוצה:
          </p>
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            block
            onClick={() => notify(saved.stay, saved.cancelled)}
            icon={<Share2 className="size-4" aria-hidden />}
          >
            עדכון השותפים
          </Button>
          <Button variant="secondary" block onClick={onClose}>
            סגירה
          </Button>
        </div>
      </Sheet>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* The flow                                                                */
  /* ---------------------------------------------------------------------- */

  return (
    <Sheet
      open
      onClose={onClose}
      title={dateLabel}
      onConfirm={choosing ? save : undefined}
      confirmDisabled={!stay}
      busy={pending}
    >
      <div className="space-y-4">
        {/* Who is already coming. The first thing anyone opening a day wants. */}
        <div>
          <p className="mb-2 text-xs font-medium text-ink-muted">מי מגיע</p>

          {attendance.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[var(--hairline)] px-3 py-4 text-center text-xs text-ink-subtle">
              עדיין אף אחד
            </p>
          ) : (
            <ul className="space-y-2">
              {[...(mine ? [mine] : []), ...others].map((row) => {
                const member = members.find((item) => item.userId === row.userId);
                const Icon = row.stay === "overnight" ? Moon : Sun;

                return (
                  <li
                    key={row.eventId}
                    className="flex items-center gap-3 rounded-2xl border border-[var(--hairline)] bg-hull-800 px-3 py-2.5"
                  >
                    <Avatar name={member?.name ?? "שותף"} color={member?.color} />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {member?.name ?? "שותף"}
                      {row.userId === currentUserId && (
                        <span className="text-ink-subtle"> (אני)</span>
                      )}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-ink-muted">
                      <Icon
                        className={cn(
                          "size-3.5",
                          row.stay === "overnight" ? "text-ink-muted" : "text-warning",
                        )}
                        aria-hidden
                      />
                      {STAY_LABEL[row.stay]}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Step 2: "מגיע!" — one tap, and only then the two choices. */}
        {!choosing ? (
          <Button
            block
            size="lg"
            onClick={() => setChoosing(true)}
            icon={<Check className="size-5" aria-hidden />}
          >
            מגיע!
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-muted">
              {mine ? "שינוי ההגעה" : "לכמה זמן"}
            </p>

            <div className="grid grid-cols-2 gap-2">
              {STAY_OPTIONS.map(({ value, Icon, hint }) => {
                const active = stay === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setStay(value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-2xl border px-3 py-4 transition active:scale-[0.98]",
                      active
                        ? "border-teal-400 bg-teal-400/10"
                        : "border-[var(--hairline)] bg-hull-800 hover:border-teal-400/30",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-6",
                        active ? "text-teal-400" : "text-ink-muted",
                      )}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "text-sm",
                        active ? "font-semibold text-ink" : "text-ink-muted",
                      )}
                    >
                      {STAY_LABEL[value]}
                    </span>
                    <span className="text-[11px] text-ink-subtle">{hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>

      {/* Cancelling is only offered to somebody who has something to cancel. */}
      {mine && (
        <div className="mt-5">
          <Button variant="danger" block loading={pending} onClick={cancel}>
            ביטול ההגעה שלי
          </Button>
        </div>
      )}
    </Sheet>
  );
}
