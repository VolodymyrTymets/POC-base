import type { InputHTMLAttributes, ReactNode } from 'react';

export const submitButtonClass =
  'bg-brand w-full rounded px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50';

export function FormCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      {children}
    </section>
  );
}

export function Field({
  label,
  ...inputProps
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-700">
      {label}
      <input
        {...inputProps}
        className="rounded border border-slate-300 px-3 py-2 text-base text-slate-900"
      />
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

export function FormSuccess({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p role="status" className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">
      {message}
    </p>
  );
}
