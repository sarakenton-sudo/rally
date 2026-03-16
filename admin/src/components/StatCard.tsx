interface StatCardProps {
  label: string;
  value: number | string;
  sublabel?: string;
}

export function StatCard({ label, value, sublabel }: StatCardProps) {
  return (
    <div className="rounded-xl border border-frost bg-warm-white p-5 shadow-sm">
      <p className="text-sm font-medium text-stone">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-bark">{value}</p>
      {sublabel && <p className="mt-1 text-xs text-stone">{sublabel}</p>}
    </div>
  );
}
