"use client";

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";
import { cn } from "@/lib/cn";

const CONTROL =
  "w-full rounded-2xl border border-[var(--hairline)] bg-hull-800 px-3.5 py-3 text-sm " +
  "text-ink placeholder:text-ink-subtle transition focus:border-teal-400/50 outline-none";

/** Label + control, laid out as a row like the mockup's form. */
export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({
  label,
  hint,
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string | null;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <input id={id} {...props} className={cn(CONTROL, className)} />
    </Field>
  );
}

/** Amount input — always LTR with a ₪ affix, whatever the page direction. */
export function MoneyInput({
  label,
  hint,
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string | null;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 start-3.5 flex items-center text-sm text-ink-muted">
          ₪
        </span>
        <input
          id={id}
          inputMode="decimal"
          dir="ltr"
          {...props}
          className={cn(CONTROL, "ps-8 text-start font-medium", className)}
        />
      </div>
    </Field>
  );
}

export function SelectInput({
  label,
  hint,
  error,
  options,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string | null;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <select id={id} {...props} className={cn(CONTROL, "appearance-none", className)}>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-hull-800">
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function DateInput({
  label,
  hint,
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string | null;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <input
        id={id}
        type="date"
        dir="ltr"
        {...props}
        className={cn(CONTROL, "text-start", className)}
      />
    </Field>
  );
}

export function TextArea({
  label,
  hint,
  error,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string | null;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <textarea id={id} rows={3} {...props} className={cn(CONTROL, "resize-none", className)} />
    </Field>
  );
}
