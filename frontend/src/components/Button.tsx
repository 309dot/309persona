import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'pill';
  loading?: boolean;
  leftIcon?: ReactNode;
}

export function Button({
  variant = 'primary',
  loading = false,
  className,
  leftIcon,
  children,
  disabled,
  ...rest
}: Props) {
  const styles = {
    primary:
      'bg-brand-600 text-white shadow-md shadow-brand-600/30 hover:bg-brand-500 disabled:bg-brand-300',
    secondary:
      'bg-white text-brand-700 border border-brand-100 hover:border-brand-300 disabled:text-slate-400',
    ghost: 'bg-transparent text-brand-700 hover:bg-brand-50',
    pill: 'border border-slate-200 bg-white text-slate-900 shadow-[0_4px_12px_rgba(15,16,32,0.08)] hover:bg-slate-50',
  };

  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 text-sm font-semibold transition-all duration-150',
        variant === 'pill' ? 'rounded-full px-5 py-2.5' : 'rounded-xl px-4 py-2',
        styles[variant],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {leftIcon ? <span className="text-lg">{leftIcon}</span> : null}
      {loading ? '처리 중...' : children}
    </button>
  );
}

