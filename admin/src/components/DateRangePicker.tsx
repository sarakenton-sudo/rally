interface Props {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

export function DateRangePicker({ from, to, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={from}
        onChange={(e) => onChange(e.target.value, to)}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <span className="text-slate-400">to</span>
      <input
        type="date"
        value={to}
        onChange={(e) => onChange(from, e.target.value)}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
    </div>
  );
}
