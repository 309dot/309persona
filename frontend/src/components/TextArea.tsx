import clsx from 'clsx';
import type { TextareaHTMLAttributes } from 'react';

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
}

export function TextArea({ label, helperText, className, ...rest }: Props) {
  return (
    <label className="flex w-full flex-col gap-2 text-sm font-medium text-slate-700">
      {label}
      <textarea
        className={clsx(
          'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100',
          className,
        )}
        {...rest}
      />
      {helperText ? <span className="text-xs text-slate-500">{helperText}</span> : null}
    </label>
  );
}

