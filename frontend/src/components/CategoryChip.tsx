import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

interface Props extends HTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function CategoryChip({ children, active, className, ...rest }: Props) {
  return (
    <button
      type="button"
      className={clsx(
        'rounded-full border px-4 py-1 text-sm font-medium transition',
        active
          ? 'border-brand-500 bg-brand-50 text-brand-700'
          : 'border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-700',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

