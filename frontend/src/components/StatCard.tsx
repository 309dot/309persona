interface Props {
  label: string;
  value: string | number;
  helper?: string;
}

export function StatCard({ label, value, helper }: Props) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {helper ? <p className="text-xs text-slate-400">{helper}</p> : null}
    </div>
  );
}

