/** Hebrew labels and shared enums. Single source of truth for UI copy. */

export const EXPENSE_CATEGORIES = [
  { value: "rental", label: "שכירות" },
  { value: "marina", label: "מרינה" },
  { value: "fuel", label: "דלק" },
  { value: "insurance", label: "ביטוח" },
  { value: "maintenance", label: "תחזוקה" },
  { value: "electricity", label: "חשמל" },
  { value: "cleaning", label: "ניקיון" },
  { value: "equipment", label: "ציוד" },
  { value: "license", label: "רישוי" },
  { value: "food", label: "אוכל ומצרכים" },
  { value: "other", label: "אחר" },
] as const;

export const DOCUMENT_CATEGORIES = [
  { value: "insurance", label: "ביטוח" },
  { value: "license", label: "רישיון" },
  { value: "rental", label: "הסכם שכירות" },
  { value: "marina", label: "מרינה" },
  { value: "electricity", label: "חשמל" },
  { value: "receipt", label: "קבלות" },
  { value: "standing_order", label: "הוראות קבע" },
  { value: "maintenance", label: "תחזוקה" },
  { value: "other", label: "אחר" },
] as const;

export const EVENT_KINDS = [
  { value: "usage", label: "שימוש בסירה" },
  { value: "arrival", label: "הגעת שותף" },
  { value: "maintenance", label: "תחזוקה" },
  { value: "payment", label: "תשלום" },
  { value: "other", label: "אחר" },
] as const;

export const CADENCES = [
  { value: "monthly", label: "חודשי" },
  { value: "quarterly", label: "רבעוני" },
  { value: "yearly", label: "שנתי" },
] as const;

export const SPLIT_MODES = [
  { value: "equal", label: "שווה" },
  { value: "percent", label: "אחוזים" },
  { value: "custom", label: "סכום מותאם" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]["value"];
export type EventKind = (typeof EVENT_KINDS)[number]["value"];
export type Cadence = (typeof CADENCES)[number]["value"];
export type SplitMode = (typeof SPLIT_MODES)[number]["value"];

const labelOf = <T extends readonly { value: string; label: string }[]>(
  list: T,
  value: string,
): string => list.find((x) => x.value === value)?.label ?? value;

export const expenseCategoryLabel = (v: string) => labelOf(EXPENSE_CATEGORIES, v);
export const documentCategoryLabel = (v: string) => labelOf(DOCUMENT_CATEGORIES, v);
export const eventKindLabel = (v: string) => labelOf(EVENT_KINDS, v);
export const cadenceLabel = (v: string) => labelOf(CADENCES, v);

/** Calendar item kinds include two derived kinds that are not real events. */
export const CALENDAR_KIND_LABEL: Record<string, string> = {
  usage: "שימוש בסירה",
  arrival: "הגעת שותף",
  maintenance: "תחזוקה",
  payment: "תשלום",
  doc_expiry: "תפוגת מסמך",
  other: "אחר",
};

/** Storage buckets — must match supabase/migrations/*_storage.sql */
export const BUCKETS = {
  receipts: "receipts",
  documents: "documents",
  media: "media",
} as const;

export const NAV_ITEMS = [
  { href: "/", label: "הבית", icon: "home" },
  { href: "/finances", label: "כספים", icon: "wallet" },
  { href: "/calendar", label: "יומן", icon: "calendar" },
  { href: "/documents", label: "מסמכים", icon: "folder" },
] as const;
