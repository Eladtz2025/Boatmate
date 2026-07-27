"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Eye,
  Loader2,
  MoreVertical,
  RefreshCw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/empty-state";
import { deleteDocument, updateDocument } from "@/app/actions";
import type { DocumentRow as DocumentRecord } from "@/lib/data";
import { cn } from "@/lib/cn";
import { isImageFile } from "./file-kind";
import {
  ACCEPTED_FILE_TYPES,
  TEMPORARY_LINK_NOTE,
  createDocumentUrl,
  uploadDocumentFile,
} from "./storage";

type Busy = "preview" | "download" | "replace" | "delete" | null;

/**
 * The ⋮ overflow menu on a document row, plus everything it can open:
 * an inline image preview sheet, a file replacement picker and a delete
 * confirmation. Replacing uploads a brand new object and repoints the row —
 * the previous file is deliberately left in the bucket.
 */
export function DocumentActions({
  boatId,
  doc,
}: {
  boatId: string;
  doc: DocumentRecord;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isImage = isImageFile(doc.mimeType, doc.originalName ?? doc.filePath);

  function closeMenu() {
    setOpen(false);
    setConfirmingDelete(false);
    setError(null);
  }

  async function run(kind: Exclude<Busy, null>, task: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await task();
    } catch (cause) {
      setError((cause as Error).message || "משהו השתבש");
    } finally {
      setBusy(null);
    }
  }

  const handlePreview = () => {
    // Minting the signed URL yields the click task, and mobile Safari blocks
    // window.open once that has happened — so the tab is claimed synchronously
    // here and pointed at the URL when it arrives.
    const tab = isImage ? null : window.open("about:blank", "_blank");
    if (tab) tab.opener = null;

    return run("preview", async () => {
      try {
        const url = await createDocumentUrl(doc.filePath);
        if (isImage) {
          setPreviewUrl(url);
          setOpen(false);
        } else if (tab) {
          tab.location.replace(url);
          closeMenu();
        } else {
          window.open(url, "_blank", "noopener,noreferrer");
          closeMenu();
        }
      } catch (cause) {
        tab?.close();
        throw cause;
      }
    });
  };

  const handleDownload = () =>
    run("download", async () => {
      const name = doc.originalName || doc.title;
      const url = await createDocumentUrl(doc.filePath, name);

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      closeMenu();
    });

  const handleReplace = (file: File) =>
    run("replace", async () => {
      const filePath = await uploadDocumentFile(boatId, file);
      const result = await updateDocument(doc.id, {
        filePath,
        mimeType: file.type || null,
        sizeBytes: file.size,
        originalName: file.name,
      });
      if (!result.ok) throw new Error(result.error);
      closeMenu();
      router.refresh();
    });

  const handleDelete = () =>
    run("delete", async () => {
      const result = await deleteDocument(doc.id);
      if (!result.ok) throw new Error(result.error);
      closeMenu();
      router.refresh();
    });

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => (open ? closeMenu() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`פעולות עבור ${doc.title}`}
        className="flex size-11 items-center justify-center rounded-full text-ink-muted transition hover:bg-hull-750 hover:text-ink"
      >
        {busy && !open ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : (
          <MoreVertical className="size-5" aria-hidden />
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="סגירת התפריט"
            onClick={closeMenu}
            className="fixed inset-0 z-40 cursor-default"
          />

          <div
            role="menu"
            className="absolute end-0 top-12 z-50 w-56 overflow-hidden rounded-2xl border border-[var(--hairline)] bg-hull-800 shadow-2xl shadow-hull-950/60"
          >
            {confirmingDelete ? (
              <div className="space-y-2 p-3">
                <p className="text-xs text-ink-muted">
                  למחוק את «{doc.title}»? הפעולה אינה הפיכה.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    className="flex-1"
                    loading={busy === "delete"}
                    onClick={handleDelete}
                  >
                    מחיקה
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    ביטול
                  </Button>
                </div>
              </div>
            ) : (
              <div className="py-1">
                <MenuItem
                  icon={Eye}
                  busy={busy === "preview"}
                  onClick={handlePreview}
                >
                  תצוגה מקדימה
                </MenuItem>
                <MenuItem
                  icon={Download}
                  busy={busy === "download"}
                  onClick={handleDownload}
                >
                  הורדה
                </MenuItem>
                <MenuItem
                  icon={RefreshCw}
                  busy={busy === "replace"}
                  onClick={() => fileInput.current?.click()}
                >
                  החלפת קובץ
                </MenuItem>
                <MenuItem
                  icon={Trash2}
                  tone="danger"
                  onClick={() => setConfirmingDelete(true)}
                >
                  מחיקה
                </MenuItem>
              </div>
            )}

            {error && (
              <div className="px-3 pb-3">
                <ErrorNote>{error}</ErrorNote>
              </div>
            )}
          </div>
        </>
      )}

      <input
        ref={fileInput}
        type="file"
        className="hidden"
        accept={ACCEPTED_FILE_TYPES}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void handleReplace(file);
        }}
      />

      <Sheet
        open={previewUrl !== null}
        onClose={() => setPreviewUrl(null)}
        title={doc.title}
        footer={
          <Button
            block
            variant="secondary"
            onClick={() =>
              previewUrl && window.open(previewUrl, "_blank", "noopener,noreferrer")
            }
          >
            פתיחה בכרטיסייה חדשה
          </Button>
        }
      >
        {previewUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={doc.title}
              className="w-full rounded-2xl border border-[var(--hairline)] bg-hull-850"
            />
            <p className="mt-3 text-center text-xs text-ink-subtle">
              {TEMPORARY_LINK_NOTE}
            </p>
          </>
        )}
      </Sheet>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  children,
  onClick,
  busy = false,
  tone = "default",
}: {
  icon: LucideIcon;
  children: ReactNode;
  onClick: () => void;
  busy?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "flex h-11 w-full items-center gap-2.5 px-3 text-start text-sm transition",
        tone === "danger"
          ? "text-danger hover:bg-danger/10"
          : "text-ink hover:bg-hull-750",
      )}
    >
      {busy ? (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        <Icon className="size-4 shrink-0" aria-hidden />
      )}
      {children}
    </button>
  );
}
