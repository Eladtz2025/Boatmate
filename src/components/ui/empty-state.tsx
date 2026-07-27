import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--hairline)] px-6 py-10 text-center">
      {icon && <div className="text-ink-subtle">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-xs text-xs text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
    >
      {children}
    </p>
  );
}
