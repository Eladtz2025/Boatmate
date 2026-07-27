"use client";

import { useState, useTransition } from "react";
import { Plane, UserPlus, X } from "lucide-react";
import { addPartnerByEmail, removePartner } from "@/app/actions";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/empty-state";
import type { Member } from "@/lib/data";

export function CrewManager({
  boatId,
  members,
  currentUserId,
}: {
  boatId: string;
  members: Member[];
  currentUserId: string;
}) {
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isRemote, setIsRemote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await addPartnerByEmail({
        boatId,
        email,
        displayName: displayName.trim() || null,
        isRemote,
      });
      if (result.ok) {
        setEmail("");
        setDisplayName("");
        setIsRemote(false);
        setAdding(false);
      } else {
        setError(result.error);
      }
    });
  }

  function remove(userId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removePartner(boatId, userId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center gap-3">
            <Avatar name={member.name} color={member.color} size="sm" />
            <span className="flex-1 truncate text-sm">
              {member.name}
              {member.userId === currentUserId && (
                <span className="ms-1.5 text-xs text-ink-subtle">(אני)</span>
              )}
            </span>
            {member.isRemote && (
              <Plane className="size-4 text-teal-400/70" aria-label="שותף מרוחק" />
            )}
            {member.userId !== currentUserId && (
              <button
                type="button"
                onClick={() => remove(member.userId)}
                disabled={pending}
                aria-label={`הסרת ${member.name}`}
                className="rounded-full p-1 text-ink-subtle transition hover:bg-hull-750 hover:text-danger disabled:opacity-50"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>

      {error && <ErrorNote>{error}</ErrorNote>}

      {adding ? (
        <div className="space-y-3 rounded-2xl border border-[var(--hairline)] p-3">
          <TextInput
            label="אימייל"
            type="email"
            dir="ltr"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="partner@example.com"
            hint="השותף צריך להירשם ל-Boatmate לפני שאפשר להוסיף אותו."
          />
          <TextInput
            label="שם תצוגה"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="אופציונלי"
          />
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={isRemote}
              onChange={(event) => setIsRemote(event.target.checked)}
              className="size-4 accent-[var(--color-teal-400)]"
            />
            שותף שמגיע מחו״ל
          </label>

          <div className="flex gap-2">
            <Button onClick={add} loading={pending} disabled={!email.trim()} size="sm">
              הוספה
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              ביטול
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          block
          size="sm"
          onClick={() => setAdding(true)}
          icon={<UserPlus className="size-4" aria-hidden />}
        >
          הוספת שותף
        </Button>
      )}
    </div>
  );
}
