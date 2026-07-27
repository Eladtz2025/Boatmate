import { CloudOff } from "lucide-react";

export const metadata = { title: "אין חיבור — Boatmate" };

export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <CloudOff className="size-10 text-ink-subtle" aria-hidden />
      <h1 className="text-lg font-semibold">אין חיבור לאינטרנט</h1>
      <p className="text-sm text-ink-muted">
        Boatmate צריך חיבור כדי להציג יתרות ומסמכים מעודכנים. נסו שוב כשהחיבור
        יחזור.
      </p>
    </main>
  );
}
