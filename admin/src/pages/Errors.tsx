import { useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { CSVExportButton } from '@/components/CSVExportButton';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useAdminData } from '@/hooks/useAdminData';
import { fetchErrors, resolveError, reviewError } from '@/lib/queries';

interface ErrorRow {
  id: string;
  error_type: string;
  error_message: string;
  severity: string;
  status: string;
  screen: string | null;
  action: string | null;
  created_at: string;
}

const col = createColumnHelper<ErrorRow>();

const columns = [
  col.accessor('severity', {
    header: 'Severity',
    cell: (info) => <StatusBadge value={info.getValue()} />,
  }),
  col.accessor('status', {
    header: 'Status',
    cell: (info) => <StatusBadge value={info.getValue()} />,
  }),
  col.accessor('error_type', { header: 'Type' }),
  col.accessor('error_message', {
    header: 'Message',
    cell: (info) => (
      <span className="max-w-xs truncate block">{info.getValue()}</span>
    ),
  }),
  col.accessor('screen', {
    header: 'Screen',
    cell: (info) => info.getValue() || '—',
  }),
  col.accessor('created_at', {
    header: 'Time',
    cell: (info) => new Date(info.getValue()).toLocaleString(),
  }),
];

export function Errors() {
  const { admin } = useAdminAuth();
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ErrorRow | null>(null);

  const { data, loading, refresh } = useAdminData(
    () => fetchErrors({ status: statusFilter || undefined, severity: severityFilter || undefined, page }),
    [statusFilter, severityFilter, page]
  );

  async function handleResolve(id: string) {
    if (!admin) return;
    await resolveError(id, admin.id);
    setSelected(null);
    refresh();
  }

  async function handleReview(id: string) {
    await reviewError(id);
    setSelected(null);
    refresh();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Errors</h1>
        <CSVExportButton data={(data ?? []) as Record<string, unknown>[]} filename="rally-errors" />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="reviewed">Reviewed</option>
          <option value="resolved">Resolved</option>
        </select>
        <select
          value={severityFilter}
          onChange={(e) => { setSeverityFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All severities</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : (
        <>
          <DataTable<ErrorRow>
            data={(data as ErrorRow[]) ?? []}
            columns={columns}
            onRowClick={(row) => setSelected(row)}
          />
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">Page {page + 1}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(data?.length ?? 0) < 50}
              className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Error Detail</h2>
            <div className="mb-3 flex gap-2">
              <StatusBadge value={selected.severity} />
              <StatusBadge value={selected.status} />
            </div>
            <dl className="space-y-2 text-sm">
              <div><dt className="font-medium text-slate-500">Type</dt><dd>{selected.error_type}</dd></div>
              <div><dt className="font-medium text-slate-500">Message</dt><dd className="break-all">{selected.error_message}</dd></div>
              <div><dt className="font-medium text-slate-500">Screen</dt><dd>{selected.screen || '—'}</dd></div>
              <div><dt className="font-medium text-slate-500">Action</dt><dd>{selected.action || '—'}</dd></div>
              <div><dt className="font-medium text-slate-500">Time</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd></div>
            </dl>
            <div className="mt-6 flex gap-2">
              {selected.status === 'new' && (
                <button
                  onClick={() => handleReview(selected.id)}
                  className="rounded-md bg-yellow-100 px-3 py-1.5 text-sm font-medium text-yellow-700 hover:bg-yellow-200"
                >
                  Mark Reviewed
                </button>
              )}
              {selected.status !== 'resolved' && (
                <button
                  onClick={() => handleResolve(selected.id)}
                  className="rounded-md bg-green-100 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-200"
                >
                  Mark Resolved
                </button>
              )}
              <button
                onClick={() => setSelected(null)}
                className="ml-auto rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
