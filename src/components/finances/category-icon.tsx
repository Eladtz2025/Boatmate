import type { ComponentType } from "react";
import {
  Anchor,
  FileText,
  Fuel,
  KeyRound,
  Package,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/cn";

/** One glyph per expense category from lib/constants.ts. */
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  rental: KeyRound,
  marina: Anchor,
  fuel: Fuel,
  insurance: ShieldCheck,
  maintenance: Wrench,
  electricity: Zap,
  cleaning: Sparkles,
  equipment: Package,
  license: FileText,
  food: ShoppingCart,
  other: Receipt,
};

export function CategoryIcon({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  const Icon = ICONS[category] ?? Receipt;
  return <Icon className={cn("size-5", className)} aria-hidden />;
}

/** The rounded tile the expense rows use. */
export function CategoryTile({ category }: { category: string }) {
  return (
    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-tile bg-hull-750 text-teal-400">
      <CategoryIcon category={category} />
    </span>
  );
}
