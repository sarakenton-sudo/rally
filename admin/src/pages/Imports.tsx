import { useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { CSVExportButton } from '@/components/CSVExportButton';
import { useAdminData } from '@/hooks/useAdminData';
import { fetchEmails } from '@/lib/queries';

interface EmailRow {
  id: string;
  user_id: string;
  from_address: string;
  subject: string;
  received_at: string;
  classification: string | null;
  action_taken: string;
  source: string;
  created_at: string;
}

const col = createColumnHelper<EmailRow>();

const columns = [
  col.accessor('source', {
    header: 'Source',
    cell: (info) => {
      const v = info.getValue();
      return (
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
          v === 'gmail' ? 'bg-rally-100 text-rally-700' : 'bg-gold/20 text-yellow-700'
        }`}>
          {v === 'gmail' ? 'Gmail Sync' : 'Forwarded'}
        </span>
      );
    },
  }),
  col.accessor('subject', {
    header: 'Subject',
    cell: (info) => <span className="max-w-xs truncate block">{info.getValue()}</span>,
  }),
  col.accessor('from_address', { header: 'From' }),
  col.accessor('classification', {
    header: 'Classification',
    cell: (info) => {
      const v = info.getValue();
      return v ? <StatusBadge value={v} /> : <span className="text-stone">—</span>;
    },
  }),
  col.accessor('action_taken', {
    header: 'Action',
    cell: (info) => {
      const v = info.getValue();
      const labels: Record<string, string> = {
        none: 'No action',
        booking_alert_sent: 'Booking alert',
        travel_import_queued: 'Import queued',
        notification_sent: 'Notification sent',
      };
      return <span className="text-sm">{labels[v] ?? v}</span>;
    },
  }),
  col.accessor('received_at', {
    header: 'Received',
    cell: (info) => new Date(info.getValue()).toLocaleString(),
  }),
];

export function Imports() {
  const [sourceFilter, setSourceFilter] = useState('');
  const [page, setPage] = useState(0);

  const { data, loading } = useAdminData(
    () => fetchEmails({ source: sourceFilter || undefined, page }),
    [sourceFilter, page]
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-bark">Import Activity</h1>
        <CSVExportButton data={(data ?? []) as Record<string, unknown>[]} filename="rally-imports" />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <select
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-frost px-2 py-1.5 text-sm text-bark"
        >
          <option value="">All sources</option>
          <option value="forward">Forwarded emails</option>
          <option value="gmail">Gmail sync</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-stone">Loading...</p>
      ) : (
        <>
          <DataTable<EmailRow>
            data={(data as EmailRow[]) ?? []}
            columns={columns}
          />
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded border border-frost px-3 py-1 text-sm text-bark disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-stone">Page {page + 1}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(data?.length ?? 0) < 50}
              className="rounded border border-frost px-3 py-1 text-sm text-bark disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
