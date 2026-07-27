"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/cn";

/** Never changes — the mounted flag only differs between server and client. */
const subscribeNoop = () => () => {};

/**
 * Full-height bottom sheet used for every create/edit flow.
 * Header mirrors the mockup: ✕ on one side, ✓ confirm on the other.
 */
export function Sheet({
  open,
  onClose,
  title,
  onConfirm,
  confirmLabel = "שמירה",
  confirmDisabled = false,
  busy = false,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  busy?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  /**
   * The portal target only exists in the browser, so rendering it during SSR
   * would make the server and client trees disagree — which is exactly what
   * happens when a sheet starts open (e.g. arriving at `?new=expense`).
   * useSyncExternalStore gives us a mounted flag with no setState-in-effect.
   */
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col">
      <button
        type="button"
        aria-label="סגירה"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 bg-hull-950/70 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet-up relative mt-auto flex max-h-[92dvh] flex-col rounded-t-3xl border-t border-[var(--hairline)] bg-hull-900"
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="ביטול"
            className="rounded-full p-1.5 text-ink-muted transition hover:bg-hull-800 hover:text-ink"
          >
            <X className="size-5" aria-hidden />
          </button>

          <h2 className="text-base font-semibold">{title}</h2>

          {onConfirm ? (
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmDisabled || busy}
              aria-label={confirmLabel}
              className={cn(
                "rounded-full p-1.5 transition",
                confirmDisabled || busy
                  ? "text-ink-subtle"
                  : "text-teal-400 hover:bg-teal-400/10",
              )}
            >
              <Check className="size-5" aria-hidden />
            </button>
          ) : (
            <span className="size-8" />
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>

        {footer && (
          <div className="border-t border-[var(--hairline)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
