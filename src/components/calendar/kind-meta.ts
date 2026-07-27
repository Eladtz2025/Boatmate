import {
  CalendarDays,
  FileWarning,
  Plane,
  Sailboat,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * One colour + icon per calendar kind, shared by the month dots, the agenda
 * rows and the detail sheet so a colour always means the same thing.
 */
export type KindMeta = {
  Icon: LucideIcon;
  /** icon colour */
  text: string;
  /** rounded tile behind the icon */
  tile: string;
  /** the small dot under a month-grid day number */
  dot: string;
};

const META: Record<string, KindMeta> = {
  usage: {
    Icon: Sailboat,
    text: "text-teal-400",
    tile: "bg-teal-400/15",
    dot: "bg-teal-400",
  },
  arrival: {
    Icon: Plane,
    text: "text-teal-400/70",
    tile: "bg-teal-400/10",
    dot: "bg-teal-400/60",
  },
  maintenance: {
    Icon: Wrench,
    text: "text-warning",
    tile: "bg-warning/15",
    dot: "bg-warning",
  },
  payment: {
    Icon: Wallet,
    text: "text-ink-muted",
    tile: "bg-hull-750",
    dot: "bg-ink-muted",
  },
  doc_expiry: {
    Icon: FileWarning,
    text: "text-danger",
    tile: "bg-danger/15",
    dot: "bg-danger",
  },
  other: {
    Icon: CalendarDays,
    text: "text-ink-muted",
    tile: "bg-hull-750",
    dot: "bg-ink-subtle",
  },
};

export function kindMeta(kind: string): KindMeta {
  return META[kind] ?? META.other;
}

/**
 * `payment` and `doc_expiry` rows are projections of a standing order and of a
 * document — they cannot be edited from the calendar, only followed to their
 * home screen.
 */
export const isDerivedKind = (kind: string) => kind === "payment" || kind === "doc_expiry";

export const derivedHref = (kind: string) =>
  kind === "payment" ? "/finances?tab=recurring" : "/documents";
