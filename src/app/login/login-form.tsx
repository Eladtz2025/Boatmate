"use client";

import { useState, type FormEvent } from "react";
import { MailCheck, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/empty-state";

/**
 * Magic-link sign-in. A boat has a handful of partners who each check email on
 * the same phone they use the app on, so a passwordless link is both the
 * simplest and the least annoying option.
 */
export function LoginForm({ initialError = null }: { initialError?: string | null }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(initialError);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus("sending");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (authError) {
      setError(authError.message);
      setStatus("idle");
      return;
    }

    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="card flex flex-col items-center gap-3 p-6 text-center">
        <MailCheck className="size-8 text-teal-400" aria-hidden />
        <p className="font-medium">הקישור נשלח</p>
        <p className="text-sm text-ink-muted">
          שלחנו קישור כניסה אל <span className="numeric">{email}</span>. פתחו אותו
          מהמכשיר הזה.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="text-xs text-teal-400 hover:text-teal-500"
        >
          שליחה לכתובת אחרת
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-xs font-medium text-ink-muted">
          כתובת אימייל
        </label>
        <input
          id="email"
          type="email"
          dir="ltr"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-2xl border border-[var(--hairline)] bg-hull-800/90 px-3.5 py-3 text-start text-sm outline-none transition placeholder:text-ink-subtle focus:border-teal-400/50"
        />
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <Button
        type="submit"
        block
        size="lg"
        loading={status === "sending"}
        icon={<Send className="size-4" aria-hidden />}
      >
        שליחת קישור כניסה
      </Button>

      <p className="pt-1 text-center text-xs text-ink-subtle">
        אין צורך בסיסמה — נשלח לכם קישור חד-פעמי.
      </p>
    </form>
  );
}
