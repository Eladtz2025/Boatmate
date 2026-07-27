import { createClient } from "@/lib/supabase/client";
import { BUCKETS } from "@/lib/constants";
import { safeFileName } from "./file-kind";

/**
 * Browser-side storage helpers for the documents bucket.
 *
 * Uploads go straight from the browser (the storage policies authorise on the
 * first path segment, which is why every key starts with the boat id), and the
 * private bucket is read through short-lived signed URLs.
 */

const SIGNED_URL_TTL_SECONDS = 3600;

/** Mirrors `file_size_limit` on the bucket in the storage migration. */
export const MAX_FILE_BYTES = 26_214_400;
const MAX_FILE_MB = Math.round(MAX_FILE_BYTES / (1024 * 1024));

/**
 * Mirrors `allowed_mime_types` on the `documents` bucket. Anything outside this
 * list is rejected by Storage with a raw English error, so the picker is
 * narrowed to it and the file is checked before the request goes out.
 */
const ALLOWED_MIME_TYPES = new Set<string>([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

/**
 * Browsers do not always report a mime type — notably for Office files — and
 * the `application/octet-stream` fallback is not in the bucket's allow list,
 * so the extension is the fallback instead.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
};

export const ACCEPTED_FILE_TYPES = [
  ...Object.keys(MIME_BY_EXTENSION).map((ext) => `.${ext}`),
  ...ALLOWED_MIME_TYPES,
].join(",");

/** The mime type Storage will accept for this file, or null if unsupported. */
function resolveContentType(file: File): string | null {
  const declared = (file.type || "").toLowerCase();
  if (ALLOWED_MIME_TYPES.has(declared)) return declared;

  const dot = file.name.lastIndexOf(".");
  const ext = dot > -1 ? file.name.slice(dot + 1).toLowerCase() : "";
  return MIME_BY_EXTENSION[ext] ?? null;
}

/** Uploads to `${boatId}/${uuid}-${safeName}` and returns the object path. */
export async function uploadDocumentFile(boatId: string, file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`הקובץ גדול מדי — אפשר להעלות עד ${MAX_FILE_MB} מגה-בייט`);
  }

  const contentType = resolveContentType(file);
  if (!contentType) {
    throw new Error("סוג הקובץ אינו נתמך — אפשר PDF, תמונה, Word או Excel");
  }

  const path = `${boatId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const supabase = createClient();

  const { error } = await supabase.storage.from(BUCKETS.documents).upload(path, file, {
    contentType,
    upsert: false,
  });

  if (error) throw new Error(error.message);
  return path;
}

/** Short-lived signed URL. Pass `downloadAs` to force a download response. */
export async function createDocumentUrl(
  filePath: string,
  downloadAs?: string,
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(BUCKETS.documents)
    .createSignedUrl(
      filePath,
      SIGNED_URL_TTL_SECONDS,
      downloadAs ? { download: downloadAs } : undefined,
    );

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "לא הצלחנו ליצור קישור לקובץ");
  }
  return data.signedUrl;
}

export const TEMPORARY_LINK_NOTE = "הקישור לקובץ זמני ותקף לשעה אחת בלבד";
