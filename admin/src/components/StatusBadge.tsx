const colors: Record<string, string> = {
  new: 'bg-rally-100 text-rally-700',
  reviewed: 'bg-gold/20 text-yellow-700',
  resolved: 'bg-sage/20 text-sage',
  under_review: 'bg-gold/20 text-yellow-700',
  planned: 'bg-rally-100 text-rally-600',
  shipped: 'bg-sage/20 text-sage',
  declined: 'bg-frost text-stone',
  warning: 'bg-gold/20 text-yellow-700',
  error: 'bg-red-100 text-red-700',
  critical: 'bg-red-200 text-red-800',
  draft: 'bg-gold/20 text-yellow-700',
  published: 'bg-sage/20 text-sage',
  sent: 'bg-rally-100 text-rally-700',
  delivered: 'bg-sage/20 text-sage',
  failed: 'bg-red-100 text-red-700',
  bounced: 'bg-red-200 text-red-800',
  push: 'bg-rally-100 text-rally-700',
  sms: 'bg-amber-100 text-amber-700',
};

export function StatusBadge({ value }: { value: string }) {
  const cls = colors[value] ?? 'bg-frost text-stone';
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}
