"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Plus, Search } from "lucide-react";
import { Chip, ChipRow } from "@/components/ui/chips";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DOCUMENT_CATEGORIES } from "@/lib/constants";
import { daysUntil, expiryLabel, expiryState, type ExpiryState } from "@/lib/format";
import type { DocumentRow as DocumentRecord } from "@/lib/data";
import { DocumentRow } from "./document-row";
import { ExpirySummary } from "./expiry-summary";
import { UploadDocumentSheet } from "./upload-sheet";

type Decorated = {
  doc: DocumentRecord;
  /** Whole days to the expiry date; null when the document never expires. */
  days: number | null;
  expiry: { state: ExpiryState; label: string } | null;
};

const ALL = "all";

export function DocumentsScreen({
  boatId,
  documents,
  openNew = false,
}: {
  boatId: string;
  documents: DocumentRecord[];
  openNew?: boolean;
}) {
  const router = useRouter();

  const [sheetOpen, setSheetOpen] = useState(openNew);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [alertsOnly, setAlertsOnly] = useState(false);

  /**
   * Expiring soonest first — which naturally floats anything already expired
   * (negative days) to the very top. Documents without an expiry date come
   * last, newest first.
   */
  const decorated = useMemo<Decorated[]>(() => {
    const now = new Date();

    return documents
      .map((doc) => {
        const state = expiryState(doc.expiresOn, doc.reminderDays, now);
        const label = expiryLabel(doc.expiresOn, doc.reminderDays, now);
        return {
          doc,
          days: doc.expiresOn ? daysUntil(doc.expiresOn, now) : null,
          expiry: state && label ? { state, label } : null,
        };
      })
      .sort((a, b) => {
        if (a.days !== null && b.days !== null && a.days !== b.days) {
          return a.days - b.days;
        }
        if (a.days !== null && b.days === null) return -1;
        if (a.days === null && b.days !== null) return 1;
        return b.doc.createdAt.localeCompare(a.doc.createdAt);
      });
  }, [documents]);

  const expiredCount = decorated.filter((d) => d.expiry?.state === "expired").length;
  const soonCount = decorated.filter((d) => d.expiry?.state === "soon").length;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return decorated.filter(({ doc, expiry }) => {
      if (alertsOnly && expiry?.state !== "expired" && expiry?.state !== "soon") {
        return false;
      }
      if (category !== ALL && doc.category !== category) return false;
      if (!needle) return true;
      return (
        doc.title.toLowerCase().includes(needle) ||
        (doc.notes ?? "").toLowerCase().includes(needle)
      );
    });
  }, [decorated, query, category, alertsOnly]);

  const filtering = alertsOnly || category !== ALL || query.trim() !== "";

  function closeSheet() {
    setSheetOpen(false);
    // Drop ?new=document so a refresh does not reopen the sheet.
    if (openNew) router.replace("/documents", { scroll: false });
  }

  function clearFilters() {
    setQuery("");
    setCategory(ALL);
    setAlertsOnly(false);
  }

  return (
    <>
      <div className="space-y-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-ink-subtle"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="חיפוש מסמכים"
            aria-label="חיפוש מסמכים"
            className="w-full rounded-2xl border border-[var(--hairline)] bg-hull-800 py-3 pe-3.5 ps-10 text-sm text-ink outline-none transition placeholder:text-ink-subtle focus:border-teal-400/50"
          />
        </div>

        <ChipRow>
          <Chip active={category === ALL} onClick={() => setCategory(ALL)}>
            הכל
          </Chip>
          {DOCUMENT_CATEGORIES.map((option) => (
            <Chip
              key={option.value}
              active={category === option.value}
              onClick={() => setCategory(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </ChipRow>

        <ExpirySummary
          expiredCount={expiredCount}
          soonCount={soonCount}
          active={alertsOnly}
          onToggle={() => setAlertsOnly((current) => !current)}
        />

        {documents.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="size-8" aria-hidden />}
            title="עדיין אין מסמכים"
            description="ביטוח, רישיון, הסכם השכירות — כל מה שחשוב לשמור עליו במקום אחד, עם התראה לפני שפג התוקף."
            action={
              <Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setSheetOpen(true)}>
                מסמך חדש
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Search className="size-8" aria-hidden />}
            title="לא נמצאו מסמכים"
            description="אין מסמכים שמתאימים לחיפוש או לסינון הנוכחי."
            action={
              <Button size="sm" variant="secondary" onClick={clearFilters}>
                ניקוי הסינון
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {visible.map(({ doc, expiry }) => (
              <DocumentRow key={doc.id} boatId={boatId} doc={doc} expiry={expiry} />
            ))}
          </ul>
        )}

        {filtering && visible.length > 0 && (
          <p className="text-center text-xs text-ink-subtle">
            <span className="numeric">{visible.length}</span> מתוך{" "}
            <span className="numeric">{documents.length}</span> מסמכים
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="מסמך חדש"
        className="fixed end-4 bottom-[calc(var(--nav-height)+1rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-teal-400 text-hull-950 shadow-lg shadow-teal-400/20 transition active:scale-95 hover:bg-teal-500"
      >
        <Plus className="size-6" aria-hidden />
      </button>

      <UploadDocumentSheet boatId={boatId} open={sheetOpen} onClose={closeSheet} />
    </>
  );
}
