"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, MailCheck, MailX, TriangleAlert } from "lucide-react";
import { disconnectGmail, startGmailConnect } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/empty-state";

/**
 * Connecting the mailbox invoices arrive in.
 *
 * The consent itself happens at Google; all this does is fetch the URL from the
 * server (which holds the client id) and navigate to it. No token ever reaches
 * this component — the callback writes it straight to the database through the
 * service role, and the only thing the browser is ever told is whether one
 * exists.
 */

/** What the callback route redirects back with, in words a partner can act on. */
const OUTCOME: Record<string, { tone: "ok" | "bad"; text: string }> = {
  connected: { tone: "ok", text: "Gmail חובר בהצלחה." },
  denied: { tone: "bad", text: "החיבור בוטל במסך של Google." },
  missing_code: { tone: "bad", text: "Google לא החזיר קוד אישור." },
  signed_out: { tone: "bad", text: "ההתחברות פגה באמצע — צריך לנסות שוב." },
  no_boat: { tone: "bad", text: "לא נמצאה סירה לחבר אליה." },
  state_mismatch: { tone: "bad", text: "החיבור לא תאם את הסירה — נסו שוב." },
  no_refresh_token: {
    tone: "bad",
    text: "Google לא החזיר הרשאה קבועה. נתקו את Boatmate בהגדרות החשבון ב-Google ונסו שוב.",
  },
  save_failed: {
    tone: "bad",
    text: "החיבור אושר אבל לא נשמר — ייתכן שהמיגרציה עדיין לא הורצה.",
  },
  exchange_failed: { tone: "bad", text: "החלפת הקוד מול Google נכשלה." },
};

export function GmailCard({
  boatId,
  connected,
  email,
  problem,
  configured,
}: {
  boatId: string;
  connected: boolean;
  email: string | null;
  /** Set when the stored connection exists but cannot be used. */
  problem: string | null;
  /** False when the server has no GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET. */
  configured: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const outcome = OUTCOME[params.get("gmail") ?? ""] ?? null;

  function connect() {
    setError(null);
    startTransition(async () => {
      const result = await startGmailConnect(boatId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // A full navigation, not a router push: the next stop is accounts.google.com.
      window.location.assign(result.url);
    });
  }

  function disconnect() {
    setError(null);
    startTransition(async () => {
      const result = await disconnectGmail(boatId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace("/settings");
      router.refresh();
    });
  }

  if (!configured) {
    return (
      <>
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <MailX className="size-4 shrink-0 text-ink-subtle" aria-hidden />
          לא מוגדר בשרת
        </p>
        <p className="mt-2 text-xs text-ink-subtle">
          ייבוא חשבוניות דורש GMAIL_CLIENT_ID ו-GMAIL_CLIENT_SECRET במשתני
          הסביבה.
        </p>
      </>
    );
  }

  return (
    <>
      {connected ? (
        <p className="flex items-center gap-2 text-sm text-teal-400">
          <MailCheck className="size-4 shrink-0" aria-hidden />
          מחובר
          {email && <span className="numeric text-xs text-ink-muted">{email}</span>}
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Mail className="size-4 shrink-0 text-ink-subtle" aria-hidden />
          לא מחובר
        </p>
      )}

      <p className="mt-2 text-xs text-ink-subtle">
        חשבוניות שנשלחות מ-Invoice One נקראות אוטומטית והופכות להוצאה. ההרשאה
        היחידה שנדרשת היא קריאה בלבד.
      </p>

      {problem && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{problem}</span>
        </p>
      )}

      {outcome && (
        <p
          className={
            outcome.tone === "ok"
              ? "mt-3 text-xs text-teal-400"
              : "mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
          }
        >
          {outcome.text}
        </p>
      )}

      <div className="mt-3">
        {connected ? (
          <Button variant="secondary" block loading={pending} onClick={disconnect}>
            ניתוק Gmail
          </Button>
        ) : (
          <Button
            block
            loading={pending}
            onClick={connect}
            icon={<Mail className="size-4" aria-hidden />}
          >
            חיבור Gmail
          </Button>
        )}
      </div>

      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </>
  );
}
