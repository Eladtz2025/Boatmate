"use client";

import { createClient } from "./supabase/client";

/**
 * Browser → Supabase Storage uploads.
 *
 * Object keys must start with the boat id: the storage policies authorise on
 * the first path segment. Filenames are sanitised because Hebrew characters
 * and spaces are not valid in storage keys.
 */

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "file";
}

export function buildObjectPath(boatId: string, filename: string): string {
  return `${boatId}/${crypto.randomUUID()}-${sanitizeFilename(filename)}`;
}

export type UploadResult =
  | { ok: true; path: string; mimeType: string; sizeBytes: number; originalName: string }
  | { ok: false; error: string };

export async function uploadFile(
  bucket: string,
  boatId: string,
  file: File,
): Promise<UploadResult> {
  const supabase = createClient();
  const path = buildObjectPath(boatId, file.name);

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    path,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    originalName: file.name,
  };
}

/** Signed URL from a client component (previews, thumbnails). */
export async function signedUrl(
  bucket: string,
  path: string,
  expiresIn = 3600,
): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}
