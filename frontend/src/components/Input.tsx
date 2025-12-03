import clsx from 'clsx';
import type { InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
}

export function Input({ label, helperText, className, ...rest }: Props) {
  return (
    <label className="flex w-full flex-col gap-2 text-sm font-medium text-slate-700">
      {label}
      <input
        className={clsx(
          'w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-base text-slate-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100',
          className,
        )}
        {...rest}
      />
      {helperText ? <span className="text-xs text-slate-500">{helperText}</span> : null}
    </label>
  );
}

