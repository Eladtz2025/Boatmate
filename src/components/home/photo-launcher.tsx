"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhotoSheet } from "./photo-sheet";

/**
 * Owns the open state of the photo sheet so the home page can stay a Server
 * Component. Mirrors how documents handles `?new=document`.
 */
export function PhotoLauncher({
  boatId,
  openNew,
}: {
  boatId: string;
  openNew: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(openNew);

  return (
    <PhotoSheet
      boatId={boatId}
      open={open}
      onClose={() => {
        setOpen(false);
        // Drop ?new=photo so a refresh does not reopen the sheet.
        if (openNew) router.replace("/", { scroll: false });
      }}
    />
  );
}
