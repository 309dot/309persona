import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function PageShell({ title, subtitle, actions, children }: Props) {
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-8 md:px-8">
      <header className="flex flex-col gap-4 rounded-3xl bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-8 text-white shadow-xl md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs tracking-widest uppercase text-white/70">309 Interview Agent</p>
          <h1 className="text-3xl font-semibold">{title}</h1>
          {subtitle ? <p className="mt-2 text-white/80">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

