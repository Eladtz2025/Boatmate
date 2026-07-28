"use client";

import Image from "next/image";
import { useGallery } from "./photo-gallery";

export type MediaThumb = { id: string; url: string; caption: string | null };

/**
 * Recent photos. Each thumbnail opens the full-screen viewer on itself — at
 * 48px these sit shoulder to shoulder, so anything destructive here was far too
 * easy to trigger by accident. Deleting lives in the viewer, where the photo is
 * full size and it is obvious which one is about to go.
 */
export function MediaStrip({
  items,
  extraCount,
  moreFromId,
}: {
  items: MediaThumb[];
  extraCount: number;
  /** First photo past the ones shown — where "+N" picks up. */
  moreFromId?: string;
}) {
  const { open } = useGallery();

  return (
    <div className="flex items-center gap-1.5">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => open(item.id)}
          aria-label={item.caption ?? "תמונה"}
          className="relative block size-12 shrink-0 overflow-hidden rounded-lg border border-[var(--hairline)] transition active:scale-95"
        >
          <Image src={item.url} alt="" fill sizes="48px" className="object-cover" />
        </button>
      ))}

      {extraCount > 0 && (
        <button
          type="button"
          onClick={() => open(moreFromId)}
          aria-label={`עוד ${extraCount} תמונות`}
          className="numeric flex size-12 shrink-0 items-center justify-center rounded-lg bg-hull-750 text-xs font-medium text-ink-muted transition active:scale-95"
        >
          +{extraCount}
        </button>
      )}
    </div>
  );
}
