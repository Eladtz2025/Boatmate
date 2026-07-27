import type { LucideIcon } from "lucide-react";
import { File, FileText, Image as ImageFileIcon, Sheet as SheetIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { fileKind, type FileKind } from "./file-kind";

const TILES: Record<FileKind, { tone: string; Icon: LucideIcon }> = {
  pdf: { tone: "bg-danger/15 text-danger", Icon: FileText },
  image: { tone: "bg-teal-400/15 text-teal-400", Icon: ImageFileIcon },
  // No blue in the token set yet — see the note in the handover summary.
  word: { tone: "bg-sky-500/15 text-sky-400", Icon: FileText },
  excel: { tone: "bg-success/15 text-success", Icon: SheetIcon },
  other: { tone: "bg-hull-750 text-ink-muted", Icon: File },
};

/** The leading square on a document row: colour and glyph by file type. */
export function FileTile({
  mimeType,
  fileName,
  size = "md",
  className,
}: {
  mimeType?: string | null;
  fileName?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const { tone, Icon } = TILES[fileKind(mimeType, fileName)];

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-tile",
        size === "md" ? "size-11" : "size-9",
        tone,
        className,
      )}
    >
      <Icon className={size === "md" ? "size-5" : "size-4"} />
    </span>
  );
}
