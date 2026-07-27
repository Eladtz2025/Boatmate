"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { deleteMedia } from "@/app/actions";

export type MediaThumb = { id: string; url: string; caption: string | null };

/**
 * Recent photos. Tapping one reveals a remove button rather than deleting on
 * the spot — these thumbnails are 48px and sit next to each other, so a
 * single-tap delete would be far too easy to trigger by accident.
 */
export function MediaStrip({
  items,
  extraCount,
}: {
  items: MediaThumb[];
  extraCount: number;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(id: string) {
    startTransition(async () => {
      await deleteMedia(id);
      setArmed(null);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      {items.map((item) => (
        <div key={item.id} className="relative size-12 shrink-0">
          <button
            type="button"
            onClick={() => setArmed(armed === item.id ? null : item.id)}
            aria-label={item.caption ?? "תמונה"}
            className="relative block size-12 overflow-hidden rounded-lg border border-[var(--hairline)]"
          >
            <Image src={item.url} alt="" fill sizes="48px" className="object-cover" />
          </button>

          {armed === item.id && (
            <button
              type="button"
              onClick={() => remove(item.id)}
              disabled={pending}
              aria-label="מחיקת התמונה"
              className="absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full bg-danger text-white shadow-md transition disabled:opacity-50"
            >
              <X className="size-3" aria-hidden />
            </button>
          )}
        </div>
      ))}

      {extraCount > 0 && (
        <span className="numeric flex size-12 shrink-0 items-center justify-center rounded-lg bg-hull-750 text-xs font-medium text-ink-muted">
          +{extraCount}
        </span>
      )}
    </div>
  );
}
