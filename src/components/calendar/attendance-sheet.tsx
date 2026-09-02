"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BellOff,
  BellRing,
  Check,
  Share2,
  TriangleAlert,
  X,
} from "lucide-react";
import { clearAttendance, setAttendance } from "@/app/actions";
import {
  SEGMENTS,
  isContiguous,
  segmentsLabel,
  segmentsRangeLabel,
  sortSegments,
  type Attendance,
  type Segment,
} from "@/lib/attendance";
import type { Member } from "@/lib/data";
import { cn } from "@/lib/cn";
import { formatLongDate } from "@/lib/format";
import type { NotifyResult } from "@/lib/push";
import { attendanceMessage, share as shareSheet } from "@/lib/whatsapp";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { parseDayKey } from "./date-utils";
import { SegmentIcon, SegmentMarks } from "./segment-marks";

/**
 * Marking attendance: tap a day, tap "מגיע!", pick the parts of it, save.
 *
 * The three segments are **independent toggles, not one choice**. "ליום או
 * לינה" could not say "I am coming after lunch and staying the night", which
 * is most of how this boat gets used; any combination is expressible now, and
 * a run of them is stored as the single continuous interval it describes.
 *
 * The full event form still exists for everything else on the calendar, but it
 * is not on this path — booking a Saturday should not mean filling in a title,
 * a start time, an end time and a location.
 *
 * Three things this screen refuses to be vague about:
 *
 * - **Editing is not adding.** A partner who already has the day marked lands
 *   straight on their current selection, and saving overwrites it. The action
 *   is idempotent on (boat, partner, day), so there is no path here that
 *   produces two rows for one person on one day — and it is reached from both
 *   the day card and the attendance row, which is why neither owns this state.
 * - **Notifications report themselves.** The app tells the other partners; the
 *   line under the tick says whether it managed to.
 * - **Google sync is reported, not assumed.** The save succeeds or fails on
 *   the boat's own record alone; if the calendar leg failed, the panel says so
 *   in as many words instead of showing a tick over a calendar that never got
 *   the event.
 */

type Saved = {
  segments: Segment[];
  cancelled: boolean;
  notify: NotifyResult;
  syncFailed: string | null;
};

/**
 * What the partner is told about the notification that just went out — or did
 * not. The app notifies automatically now; this line exists so "automatically"
 * never has to be taken on trust.
 */
function NotifyLine({ notify }: { notify: NotifyResult }) {
  if (notify.status === "sent") {
    return (
      <p className="flex items-center gap-2 text-xs text-teal-400">
        <BellRing className="size-3.5 shrink-0" aria-hidden />
        נשלחה התראה לשותפים
        {notify.sent > 1 && (
          <span className="numeric text-ink-subtle">({notify.sent} מכשירים)</span>
        )}
      </p>
    );
  }

  // "none" and "unavailable" are not failures of this save, but they do mean
  // nobody's phone buzzed, and saying nothing would imply one did.
  return (
    <p
      className={cn(
        "flex items-start gap-2 text-xs",
        notify.status === "failed" ? "text-warning" : "text-ink-subtle",
      )}
    >
      <BellOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{notify.message ?? "לא נשלחה התראה."}</span>
    </p>
  );
}

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

  // Someone already coming starts on their current selection, so the sheet is
  // an edit rather than a fresh decision. Everyone else starts on "מגיע!".
  const [choosing, setChoosing] = useState(mine !== null);
  const [selected, setSelected] = useState<Segment[]>(mine?.segments ?? []);

  const dateLabel = formatLongDate(parseDayKey(dateKey));
  const partnerName = me?.name ?? "שותף";

  function toggle(segment: Segment) {
    setSelected((current) =>
      current.includes(segment)
        ? current.filter((key) => key !== segment)
        : sortSegments([...current, segment]),
    );
  }

  /** The optional extra: put it in the group chat too. Not the notification. */
  function share(segments: Segment[], cancelled: boolean) {
    void shareSheet(
      attendanceMessage(boatName, {
        partnerName,
        segmentsLabel: segmentsLabel(segments),
        dateLabel,
        cancelled,
      }),
    );
  }

  function save() {
    if (selected.length === 0) return;
    setError(null);

    startTransition(async () => {
      const result = await setAttendance({ boatId, dateKey, segments: selected });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.refresh();
      setSaved({
        segments: selected,
        cancelled: false,
        notify: result.notify,
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
        segments: [],
        cancelled: true,
        notify: result.notify,
        syncFailed: result.sync.status === "failed" ? (result.sync.message ?? "") : null,
      });
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Saved — what happened, and what the others were told                    */
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
              {saved.cancelled ? (
                <p className="text-xs text-ink-muted">
                  השותפים כבר לא רואים אותך ביום הזה
                </p>
              ) : (
                <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-ink-muted">
                  <span>{partnerName} —</span>
                  <SegmentMarks segments={saved.segments} iconClassName="size-3.5" />
                  <span>{segmentsLabel(saved.segments)}</span>
                  <span className="numeric text-ink-subtle">
                    {segmentsRangeLabel(saved.segments)}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* The notification is the app's job and it reports on itself, so
              "the others were told" never has to be assumed. */}
          <NotifyLine notify={saved.notify} />

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
        </div>

        <div className="mt-4 flex gap-2">
          <Button block onClick={onClose}>
            סגירה
          </Button>
          {/* Secondary, and optional: the crew are already notified. This is
              for when somebody wants it in the group chat as well. */}
          <Button
            variant="secondary"
            block
            onClick={() => share(saved.segments, saved.cancelled)}
            icon={<Share2 className="size-4" aria-hidden />}
          >
            שיתוף בצ׳אט
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
      confirmDisabled={selected.length === 0}
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
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
                      <SegmentMarks segments={row.segments} iconClassName="size-3.5" />
                      {segmentsLabel(row.segments)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Step 2: "מגיע!" — one tap, and only then the parts of the day. */}
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
              {mine ? "שינוי ההגעה" : "אילו חלקים של היום"}
            </p>

            <div className="space-y-2">
              {SEGMENTS.map((segment) => {
                const active = selected.includes(segment.key);
                return (
                  <button
                    key={segment.key}
                    type="button"
                    role="checkbox"
                    aria-checked={active}
                    onClick={() => toggle(segment.key)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-start transition active:scale-[0.99]",
                      active
                        ? "border-teal-400 bg-teal-400/10"
                        : "border-[var(--hairline)] bg-hull-800 hover:border-teal-400/30",
                    )}
                  >
                    {/* A tick box, because these are independent choices and
                        must not read as one-of-three. */}
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-md border transition",
                        active
                          ? "border-teal-400 bg-teal-400 text-hull-950"
                          : "border-ink-subtle",
                      )}
                    >
                      {active && <Check className="size-3.5" aria-hidden />}
                    </span>

                    <SegmentIcon
                      segment={segment.key}
                      className={cn(
                        "size-5 shrink-0",
                        active ? "text-teal-400" : "text-ink-muted",
                      )}
                    />

                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-sm",
                          active ? "font-semibold text-ink" : "text-ink-muted",
                        )}
                      >
                        {segment.label}
                      </span>
                      <span className="numeric block text-[11px] text-ink-subtle">
                        {segment.clock}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* What the selection adds up to, so the stored interval is never
                a surprise — including the one case that is not a single run. */}
            {selected.length > 0 && (
              <p className="flex flex-wrap items-center gap-x-1.5 pt-0.5 text-[11px] text-ink-muted">
                <SegmentMarks segments={selected} iconClassName="size-3" />
                <span className="numeric">{segmentsRangeLabel(selected)}</span>
                {!isContiguous(selected) && (
                  <span className="text-ink-subtle">
                    · ללא {segmentsLabel(
                      SEGMENTS.map((segment) => segment.key).filter(
                        (key) => !selected.includes(key),
                      ),
                    )}
                  </span>
                )}
              </p>
            )}
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
