"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/empty-state";
import { DateInput, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { DOCUMENT_CATEGORIES } from "@/lib/constants";
import { formatFileSize } from "@/lib/format";
import { createDocument } from "@/app/actions";
import { FILE_KIND_LABEL, fileKind } from "./file-kind";
import { FileTile } from "./file-tile";
import { ACCEPTED_FILE_TYPES, uploadDocumentFile } from "./storage";

const REMINDER_OPTIONS = [7, 14, 30, 60, 90].map((days) => ({
  value: String(days),
  label: `${days} ימים`,
}));

const CATEGORY_OPTIONS = DOCUMENT_CATEGORIES.map((category) => ({
  value: category.value,
  label: category.label,
}));

const DEFAULT_REMINDER = "30";

/** Strips the extension so the title field gets a sensible default. */
function titleFromFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name).trim();
}

export function UploadDocumentSheet({
  boatId,
  open,
  onClose,
}: {
  boatId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(DOCUMENT_CATEGORIES[0].value);
  const [issuedOn, setIssuedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [reminderDays, setReminderDays] = useState(DEFAULT_REMINDER);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setTitle("");
    setCategory(DOCUMENT_CATEGORIES[0].value);
    setIssuedOn("");
    setExpiresOn("");
    setReminderDays(DEFAULT_REMINDER);
    setNotes("");
    setError(null);
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  function pickFile(picked: File | undefined) {
    if (!picked) return;
    setFile(picked);
    setError(null);
    setTitle((current) => current.trim() || titleFromFileName(picked.name));
  }

  async function submit() {
    if (!file) {
      setError("צריך לבחור קובץ");
      return;
    }
    if (!title.trim()) {
      setError("צריך כותרת למסמך");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const filePath = await uploadDocumentFile(boatId, file);
      const result = await createDocument({
        boatId,
        title: title.trim(),
        category,
        filePath,
        originalName: file.name,
        mimeType: file.type || null,
        sizeBytes: file.size,
        issuedOn: issuedOn || null,
        expiresOn: expiresOn || null,
        reminderDays: expiresOn ? Number(reminderDays) : 30,
        notes: notes.trim() || null,
      });

      if (!result.ok) throw new Error(result.error);

      reset();
      onClose();
      router.refresh();
    } catch (cause) {
      setError((cause as Error).message || "העלאת המסמך נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="מסמך חדש"
      onConfirm={submit}
      confirmLabel="שמירה"
      confirmDisabled={!file || !title.trim()}
      busy={busy}
      footer={
        <Button
          block
          size="lg"
          loading={busy}
          disabled={!file || !title.trim()}
          onClick={submit}
        >
          {busy ? "מעלה קובץ…" : "שמירת המסמך"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-[var(--hairline)] bg-hull-850 px-4 py-5 text-start transition hover:border-teal-400/40 disabled:opacity-60"
          >
            {file ? (
              <>
                <FileTile mimeType={file.type} fileName={file.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {file.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                    <span>{FILE_KIND_LABEL[fileKind(file.type, file.name)]}</span>
                    <span aria-hidden>·</span>
                    <span className="numeric">{formatFileSize(file.size)}</span>
                  </span>
                </span>
                <span className="text-xs font-medium text-teal-400">החלפה</span>
              </>
            ) : (
              <>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-tile bg-teal-400/15 text-teal-400">
                  <Upload className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-medium text-ink">בחר קובץ</span>
                  <span className="block text-xs text-ink-muted">
                    PDF, תמונה, Word או Excel
                  </span>
                </span>
              </>
            )}
          </button>

          <input
            ref={fileInput}
            type="file"
            className="hidden"
            accept={ACCEPTED_FILE_TYPES}
            onChange={(event) => {
              const picked = event.target.files?.[0];
              event.target.value = "";
              pickFile(picked);
            }}
          />
        </div>

        <TextInput
          label="כותרת"
          required
          value={title}
          placeholder="ביטוח צד ג׳ 2026"
          onChange={(event) => setTitle(event.target.value)}
        />

        <SelectInput
          label="קטגוריה"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />

        <DateInput
          label="תאריך הנפקה"
          value={issuedOn}
          onChange={(event) => setIssuedOn(event.target.value)}
        />

        <DateInput
          label="תוקף עד"
          hint="השאירו ריק אם למסמך אין תאריך תפוגה"
          value={expiresOn}
          onChange={(event) => setExpiresOn(event.target.value)}
        />

        {expiresOn && (
          <SelectInput
            label="תזכורת לפני"
            hint="מתי להתחיל להתריע על התפוגה"
            options={REMINDER_OPTIONS}
            value={reminderDays}
            onChange={(event) => setReminderDays(event.target.value)}
          />
        )}

        <TextArea
          label="הערות"
          value={notes}
          placeholder="מספר פוליסה, איש קשר, כל דבר שכדאי לזכור"
          onChange={(event) => setNotes(event.target.value)}
        />

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Sheet>
  );
}
