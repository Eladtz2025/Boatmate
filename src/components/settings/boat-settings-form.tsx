"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Check } from "lucide-react";
import { updateBoat } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { ErrorNote } from "@/components/ui/empty-state";
import { BUCKETS } from "@/lib/constants";
import { uploadFile } from "@/lib/upload";
import type { Boat } from "@/lib/data";

export function BoatSettingsForm({ boat }: { boat: Boat }) {
  const [name, setName] = useState(boat.name);
  const [tagline, setTagline] = useState(boat.tagline ?? "");
  const [statusText, setStatusText] = useState(boat.statusText ?? "");
  const [homePort, setHomePort] = useState(boat.homePort ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateBoat(boat.id, {
        name: name.trim(),
        tagline: tagline.trim() || null,
        statusText: statusText.trim() || null,
        homePort: homePort.trim() || null,
      });
      if (result.ok) setSaved(true);
      else setError(result.error);
    });
  }

  async function onPhotoPicked(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);

    const uploaded = await uploadFile(BUCKETS.media, boat.id, file);
    if (!uploaded.ok) {
      setError(uploaded.error);
      setUploading(false);
      return;
    }

    const result = await updateBoat(boat.id, { photoPath: uploaded.path });
    if (!result.ok) setError(result.error);
    setUploading(false);
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={uploading}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-[var(--hairline)] px-3.5 py-3 text-start transition hover:border-teal-400/40 disabled:opacity-60"
      >
        <Camera className="size-5 shrink-0 text-teal-400" aria-hidden />
        <span className="text-sm">
          {uploading ? "מעלה תמונה…" : "החלפת תמונת הסירה"}
        </span>
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => onPhotoPicked(event.target.files?.[0])}
      />

      <TextInput
        label="שם הסירה"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={80}
      />
      <TextInput
        label="כותרת משנה"
        value={tagline}
        onChange={(event) => setTagline(event.target.value)}
        maxLength={80}
        placeholder="הבית שלנו על המים"
      />
      <TextInput
        label="סטטוס"
        value={statusText}
        onChange={(event) => setStatusText(event.target.value)}
        maxLength={120}
        placeholder="עוגנת במרינה, מוכנה להפלגה"
      />
      <TextInput
        label="מרינה"
        value={homePort}
        onChange={(event) => setHomePort(event.target.value)}
        maxLength={80}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Button onClick={save} loading={pending} block disabled={!name.trim()}>
        {saved && !pending ? (
          <>
            <Check className="size-4" aria-hidden />
            נשמר
          </>
        ) : (
          "שמירה"
        )}
      </Button>
    </div>
  );
}
