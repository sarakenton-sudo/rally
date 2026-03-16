import { downloadCSV } from '@/lib/csv';

interface Props {
  data: Record<string, unknown>[];
  filename: string;
  label?: string;
}

export function CSVExportButton({ data, filename, label = 'Export CSV' }: Props) {
  return (
    <button
      onClick={() => downloadCSV(data, filename)}
      disabled={data.length === 0}
      className="rounded-md border border-frost bg-warm-white px-3 py-1.5 text-sm font-medium text-bark hover:bg-cream disabled:opacity-50"
    >
      {label}
    </button>
  );
}
