import type { Metadata } from "next";
import { FolderOpen } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentsScreen } from "@/components/documents/documents-screen";
import { getBoat, getDocuments } from "@/lib/data";

export const metadata: Metadata = { title: "מסמכים — Boatmate" };

const isNewDocument = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) === "document";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string | string[] }>;
}) {
  const [params, boat] = await Promise.all([searchParams, getBoat()]);

  if (!boat) {
    return (
      <div className="px-4 py-10 pb-24">
        <EmptyState
          icon={<FolderOpen className="size-6" aria-hidden />}
          title="אין עדיין סירה"
          description="צריך להוסיף סירה כדי לשמור כאן ביטוח, רישיון והסכמים."
        />
      </div>
    );
  }

  const documents = await getDocuments(boat.id);

  return (
    <div className="mx-auto w-full max-w-lg pb-24">
      <header className="flex items-baseline justify-between gap-3 px-4 pt-5 pb-3">
        <h1 className="text-2xl font-semibold text-ink">מסמכים</h1>
        {documents.length > 0 && (
          <span className="text-xs text-ink-muted">
            <span className="numeric">{documents.length}</span> מסמכים
          </span>
        )}
      </header>

      <div className="px-4">
        <DocumentsScreen
          boatId={boat.id}
          documents={documents}
          openNew={isNewDocument(params.new)}
        />
      </div>
    </div>
  );
}
