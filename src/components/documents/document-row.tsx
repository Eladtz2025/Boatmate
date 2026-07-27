"use client";

import { Card } from "@/components/ui/card";
import { ExpiryBadge } from "@/components/ui/badge";
import { documentCategoryLabel } from "@/lib/constants";
import { formatFileSize, formatShortDate, type ExpiryState } from "@/lib/format";
import type { DocumentRow as DocumentRecord } from "@/lib/data";
import { FileTile } from "./file-tile";
import { DocumentActions } from "./document-actions";

export function DocumentRow({
  boatId,
  doc,
  expiry,
}: {
  boatId: string;
  doc: DocumentRecord;
  expiry: { state: ExpiryState; label: string } | null;
}) {
  const size = formatFileSize(doc.sizeBytes);

  return (
    <Card as="li" className="flex items-start gap-3 p-3">
      <FileTile mimeType={doc.mimeType} fileName={doc.originalName ?? doc.filePath} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{doc.title}</p>

        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-muted">
          <span>{documentCategoryLabel(doc.category)}</span>
          {size && (
            <>
              <span aria-hidden>·</span>
              <span className="numeric">{size}</span>
            </>
          )}
          {doc.issuedOn && (
            <>
              <span aria-hidden>·</span>
              <span className="numeric">{formatShortDate(doc.issuedOn)}</span>
            </>
          )}
        </p>

        {expiry && (
          <div className="mt-2">
            <ExpiryBadge state={expiry.state} label={expiry.label} />
          </div>
        )}

        {doc.notes && (
          <p className="mt-1.5 line-clamp-2 text-xs text-ink-subtle">{doc.notes}</p>
        )}
      </div>

      <DocumentActions boatId={boatId} doc={doc} />
    </Card>
  );
}
