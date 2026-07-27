import { cn } from "@/lib/cn";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1);
  return parts[0].slice(0, 1) + parts[1].slice(0, 1);
}

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
} as const;

export function Avatar({
  name,
  color,
  size = "sm",
  className,
}: {
  name: string;
  color?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      title={name}
      style={color ? { backgroundColor: `${color}33`, color } : undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        "bg-teal-400/20 text-teal-400 ring-1 ring-[var(--hairline)]",
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
}: {
  people: Array<{ name: string; color?: string | null }>;
  max?: number;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;

  return (
    <div className="flex items-center">
      {shown.map((person, index) => (
        <Avatar
          key={`${person.name}-${index}`}
          name={person.name}
          color={person.color}
          size="xs"
          className={cn("ring-2 ring-hull-800", index > 0 && "-ms-2")}
        />
      ))}
      {extra > 0 && (
        <span className="-ms-2 inline-flex size-6 items-center justify-center rounded-full bg-hull-750 text-[10px] font-medium text-ink-muted ring-2 ring-hull-800">
          +{extra}
        </span>
      )}
    </div>
  );
}
