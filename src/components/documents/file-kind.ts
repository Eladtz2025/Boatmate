/**
 * Maps a stored document to a coarse file kind, which drives the tile colour,
 * the icon and how the preview action behaves (inline vs. new tab).
 *
 * Both the mime type and the original file name are consulted — Supabase does
 * not always receive a mime type from the browser for Office files.
 */

export type FileKind = "pdf" | "image" | "word" | "excel" | "other";

const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "avif"];

function extensionOf(fileName: string | null | undefined): string {
  const name = (fileName ?? "").toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot > -1 ? name.slice(dot + 1) : "";
}

export function fileKind(
  mimeType?: string | null,
  fileName?: string | null,
): FileKind {
  const mime = (mimeType ?? "").toLowerCase();
  const ext = extensionOf(fileName);

  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("image/") || IMAGE_EXT.includes(ext)) return "image";
  if (mime.includes("word") || ext === "doc" || ext === "docx") return "word";
  if (
    mime.includes("sheet") ||
    mime.includes("excel") ||
    ext === "xls" ||
    ext === "xlsx" ||
    ext === "csv"
  ) {
    return "excel";
  }
  return "other";
}

/** Hebrew label for the kind — used in the upload sheet's file summary. */
export const FILE_KIND_LABEL: Record<FileKind, string> = {
  pdf: "PDF",
  image: "תמונה",
  word: "מסמך Word",
  excel: "גיליון Excel",
  other: "קובץ",
};

export const isImageFile = (mimeType?: string | null, fileName?: string | null) =>
  fileKind(mimeType, fileName) === "image";

/**
 * Storage keys must stay ASCII — Hebrew file names break the object path, so
 * the name is stripped down and the extension preserved separately.
 */
export function safeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const rawBase = dot > 0 ? name.slice(0, dot) : name;
  const rawExt = dot > 0 ? name.slice(dot + 1) : "";

  const clean = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "");

  const base = clean(rawBase).slice(0, 60) || "file";
  const ext = clean(rawExt).slice(0, 10);
  return ext ? `${base}.${ext}` : base;
}
