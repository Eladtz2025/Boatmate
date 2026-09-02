/**
 * The one line the sync button prints.
 *
 * Pure, and in its own module rather than beside the importer, for the same
 * reason `weather.ts` is separate from `weather-data.ts`: a presentation helper
 * that drags in a database client cannot be unit-tested, and this is the string
 * a partner actually reads.
 */

export type SyncCounts = {
  imported: number;
  skipped: number;
};

/** "2 חשבוניות נוספו" / "אין חשבוניות חדשות" — the whole sync UI. */
export function summariseSync(result: SyncCounts): string {
  if (result.imported === 0) {
    return result.skipped > 0
      ? `אין חשבוניות חדשות (${result.skipped} דולגו)`
      : "אין חשבוניות חדשות";
  }
  if (result.imported === 1) return "חשבונית אחת נוספה";
  return `${result.imported} חשבוניות נוספו`;
}
