const colors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  reviewed: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  planned: 'bg-purple-100 text-purple-700',
  shipped: 'bg-green-100 text-green-700',
  declined: 'bg-slate-100 text-slate-500',
  warning: 'bg-yellow-100 text-yellow-700',
  error: 'bg-red-100 text-red-700',
  critical: 'bg-red-200 text-red-800',
};

export function StatusBadge({ value }: { value: string }) {
  const cls = colors[value] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}
