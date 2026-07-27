"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/empty-state";
import { requestEntry } from "./actions";

/**
 * Email-only entrance. Type the address, press the button, you are in — no
 * password, no code, no round trip through an email app.
 *
 * The two halves are split for a reason that is easy to undo by accident:
 * `requestEntry` runs on the server because only the service role can mint the
 * token, but `verifyOtp` has to run *here*, in the browser. A Server Component
 * cannot write the auth cookies — `createClient()` in `server.ts` swallows that
 * failure — so redeeming the token on the server would look like it worked and
 * then throw the session away. See AGENTS.md.
 */
export function LoginForm({
  initialError = null,
  next = "/",
}: {
  initialError?: string | null;
  next?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    // A rejected server action (bad deploy, no network, missing env var) would
    // otherwise leave the button spinning with nothing on screen.
    try {
      const result = await requestEntry(email);
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }

      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: result.tokenHash,
        type: "magiclink",
      });

      if (verifyError) {
        setError(verifyError.message);
        setBusy(false);
        return;
      }
    } catch (cause) {
      console.error("[login] entry failed:", cause);
      setError("לא הצלחנו להיכנס. בדקו את החיבור ונסו שוב.");
      setBusy(false);
      return;
    }

    // Deliberately leaves `busy` set: the button stays in its loading state
    // until the new route paints, instead of flicking back to idle first.
    router.replace(next);
    router.refresh();
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
          autoFocus
          autoComplete="email"
          enterKeyHint="go"
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
        loading={busy}
        icon={<LogIn className="size-4" aria-hidden />}
      >
        כניסה
      </Button>

      <p className="pt-1 text-center text-xs text-ink-subtle">
        הכניסה פתוחה לשותפי הסירה בלבד.
      </p>
    </form>
  );
}
