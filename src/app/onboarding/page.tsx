import { redirect } from "next/navigation";
import { Anchor } from "lucide-react";
import { createBoat } from "@/app/actions";
import { getBoat, getCurrentUser } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/empty-state";

export const metadata = { title: "הסירה שלכם — Boatmate" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const boat = await getBoat();
  if (boat) redirect("/");

  const { error } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <Anchor className="mx-auto mb-3 size-8 text-teal-400" aria-hidden />
        <h1 className="text-2xl font-bold">נעים להכיר</h1>
        <p className="mt-2 text-sm text-ink-muted">
          בואו נוסיף את הסירה. אפשר לשנות הכל בהמשך.
        </p>
      </div>

      <form action={createBoat} className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="space-y-1.5">
          <label htmlFor="name" className="block text-xs font-medium text-ink-muted">
            שם הסירה
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={80}
            placeholder="סאונד אוף סי"
            className="w-full rounded-2xl border border-[var(--hairline)] bg-hull-800 px-3.5 py-3 text-sm outline-none transition placeholder:text-ink-subtle focus:border-teal-400/50"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="tagline" className="block text-xs font-medium text-ink-muted">
            כותרת משנה <span className="text-ink-subtle">(אופציונלי)</span>
          </label>
          <input
            id="tagline"
            name="tagline"
            maxLength={80}
            placeholder="הבית שלנו על המים"
            className="w-full rounded-2xl border border-[var(--hairline)] bg-hull-800 px-3.5 py-3 text-sm outline-none transition placeholder:text-ink-subtle focus:border-teal-400/50"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="home_port" className="block text-xs font-medium text-ink-muted">
            מרינה <span className="text-ink-subtle">(אופציונלי)</span>
          </label>
          <input
            id="home_port"
            name="home_port"
            maxLength={80}
            placeholder="מרינה הרצליה"
            className="w-full rounded-2xl border border-[var(--hairline)] bg-hull-800 px-3.5 py-3 text-sm outline-none transition placeholder:text-ink-subtle focus:border-teal-400/50"
          />
        </div>

        <Button type="submit" block size="lg" className="mt-2">
          יוצאים לדרך
        </Button>
      </form>
    </main>
  );
}
