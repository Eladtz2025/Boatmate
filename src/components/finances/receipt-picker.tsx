"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BUCKETS } from "@/lib/constants";
import { formatFileSize } from "@/lib/format";

/**
 * Receipt capture. The file goes straight from the browser to Supabase Storage;
 * the object path always starts with the boat id because that first segment is
 * what the storage RLS policies authorise against.
 */
export function ReceiptPicker({
  boatId,
  path,
  onChange,
}: {
  boatId: string;
  path: string | null;
  onChange: (path: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ name: string; size: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(file: File) {
    setError(null);
    setBusy(true);
    setMeta({ name: file.name, size: file.size });
    setPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60) || "receipt";
    const objectPath = `${boatId}/${crypto.randomUUID()}-${safeName}`;

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(BUCKETS.receipts)
      .upload(objectPath, file, { cacheControl: "3600", upsert: false });

    setBusy(false);

    if (uploadError) {
      setError("העלאת הקבלה נכשלה");
      setPreview(null);
      setMeta(null);
      return;
    }

    onChange(objectPath);
  }

  function clear() {
    setPreview(null);
    setMeta(null);
    setError(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (path && !busy) {
    return (
      <div className="flex items-center gap-3 rounded-tile border border-[var(--hairline)] bg-hull-800 p-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="תצוגה מקדימה של הקבלה"
            className="size-14 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-xl bg-hull-750 text-teal-400">
            <Camera className="size-5" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{meta?.name ?? "קבלה"}</p>
          {meta?.size ? (
            <p className="numeric text-xs text-ink-subtle">{formatFileSize(meta.size)}</p>
          ) : (
            <p className="text-xs text-success">הקבלה הועלתה</p>
          )}
        </div>
        <button
          type="button"
          onClick={clear}
          aria-label="הסרת הקבלה"
          className="rounded-full p-2 text-ink-muted transition hover:bg-hull-750 hover:text-danger"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="relative flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-tile border border-dashed border-[var(--hairline)] bg-hull-850/60 px-4 py-6 text-center transition hover:border-teal-400/40">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handlePick(file);
          }}
        />
        {busy ? (
          <Loader2 className="size-6 animate-spin text-teal-400" aria-hidden />
        ) : (
          <Camera className="size-6 text-teal-400" aria-hidden />
        )}
        <span className="text-sm font-medium text-ink">
          {busy ? "מעלה קבלה…" : "הוסף קבלה"}
        </span>
        <span className="text-xs text-ink-subtle">צלם או בחר מהגלריה</span>
      </label>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
