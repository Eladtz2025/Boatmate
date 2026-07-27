"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { createMedia } from "@/app/actions";
import { BUCKETS } from "@/lib/constants";
import { uploadFile } from "@/lib/upload";
import { Sheet } from "@/components/ui/sheet";
import { TextInput } from "@/components/ui/field";

/**
 * Adds a photo to the boat's gallery. Reached from the home quick action
 * (`/?new=photo`). The file goes straight from the browser to Storage; the
 * server action only records the resulting path.
 */
export function PhotoSheet({
  boatId,
  open,
  onClose,
}: {
  boatId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    // Object URLs leak until revoked.
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setCaption("");
    setError(null);
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  function pickFile(picked: File | undefined) {
    if (!picked) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    setError(null);
  }

  async function submit() {
    if (!file) {
      setError("צריך לבחור תמונה");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const upload = await uploadFile(BUCKETS.media, boatId, file);
      if (!upload.ok) throw new Error(upload.error);

      const result = await createMedia({
        boatId,
        path: upload.path,
        caption: caption.trim() || null,
      });
      if (!result.ok) throw new Error(result.error);

      reset();
      onClose();
      router.refresh();
    } catch (cause) {
      setError((cause as Error).message || "העלאת התמונה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="תמונה חדשה"
      onConfirm={submit}
      confirmDisabled={!file}
      busy={busy}
      confirmLabel="שמירת התמונה"
    >
      <div className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => pickFile(event.target.files?.[0])}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-[var(--hairline)] bg-hull-850 p-6 text-center transition hover:bg-hull-800"
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob: preview, not a remote asset
            <img
              src={previewUrl}
              alt="תצוגה מקדימה"
              className="max-h-56 w-full rounded-xl object-cover"
            />
          ) : (
            <>
              <Camera className="size-6 text-teal-400" aria-hidden />
              <span className="text-sm font-medium text-ink">בחר תמונה</span>
              <span className="text-xs text-ink-muted">צלם או בחר מהגלריה</span>
            </>
          )}
        </button>

        {file && <p className="text-center text-xs text-ink-muted">להחלפה, הקישו על התמונה</p>}

        <TextInput
          label="כיתוב (אופציונלי)"
          placeholder="למשל: שקיעה בדרך חזרה"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
        />

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}
