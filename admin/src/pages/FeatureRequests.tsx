import { useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { CSVExportButton } from '@/components/CSVExportButton';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useAdminData } from '@/hooks/useAdminData';
import { fetchFeatureRequests, updateFeatureRequestStatus } from '@/lib/queries';

interface FeatureRow {
  id: string;
  user_id: string;
  event_type: string;
  occurred_at: string;
  metadata: Record<string, unknown>;
  status: string;
  admin_response: string | null;
}

const col = createColumnHelper<FeatureRow>();

const columns = [
  col.accessor('status', {
    header: 'Status',
    cell: (info) => <StatusBadge value={info.getValue() ?? 'new'} />,
  }),
  col.accessor((row) => (row.metadata?.title as string) || (row.metadata?.description as string) || '—', {
    id: 'title',
    header: 'Request',
    cell: (info) => <span className="max-w-sm truncate block">{info.getValue()}</span>,
  }),
  col.accessor('user_id', {
    header: 'User',
    cell: (info) => <span className="font-mono text-xs">{info.getValue().slice(0, 8)}...</span>,
  }),
  col.accessor('occurred_at', {
    header: 'Submitted',
    cell: (info) => new Date(info.getValue()).toLocaleDateString(),
  }),
];

const statusOptions = ['new', 'under_review', 'planned', 'shipped', 'declined'];

export function FeatureRequests() {
  const { admin } = useAdminAuth();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<FeatureRow | null>(null);
  const [responseText, setResponseText] = useState('');
  const [newStatus, setNewStatus] = useState('');

  const { data, loading, refresh } = useAdminData(
    () => fetchFeatureRequests({ status: statusFilter || undefined, page }),
    [statusFilter, page]
  );

  async function handleUpdate() {
    if (!selected || !admin || !newStatus) return;
    await updateFeatureRequestStatus(
      selected.id,
      newStatus,
      responseText.trim() || null,
      admin.id
    );
    setSelected(null);
    setResponseText('');
    setNewStatus('');
    refresh();
  }

  function openDetail(row: FeatureRow) {
    setSelected(row);
    setNewStatus(row.status ?? 'new');
    setResponseText(row.admin_response ?? '');
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-bark">Feature Requests</h1>
        <CSVExportButton data={(data ?? []) as Record<string, unknown>[]} filename="rally-feature-requests" />
      </div>

      <div className="mb-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="rounded-md border border-frost px-2 py-1.5 text-sm text-bark"
        >
          <option value="">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-stone">Loading...</p>
      ) : (
        <>
          <DataTable<FeatureRow>
            data={(data as FeatureRow[]) ?? []}
            columns={columns}
            onRowClick={openDetail}
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

      {/* Detail/respond modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg rounded-xl bg-warm-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-bark">Feature Request</h2>
            <div className="mb-4 rounded-lg bg-cream p-3 text-sm">
              <p className="font-medium text-bark">{String(selected.metadata?.title ?? 'No title')}</p>
              {selected.metadata?.description ? (
                <p className="mt-1 text-stone">{String(selected.metadata.description)}</p>
              ) : null}
              <p className="mt-2 text-xs text-stone">
                {new Date(selected.occurred_at).toLocaleString()}
              </p>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-sm font-medium text-bark">Status</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full rounded-md border border-frost px-2 py-1.5 text-sm text-bark"
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-bark">Admin Response</label>
              <textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-frost px-3 py-2 text-sm text-bark focus:border-rally-500 focus:outline-none focus:ring-1 focus:ring-rally-500"
                placeholder="Optional response..."
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleUpdate}
                className="rounded-md bg-rally-500 px-4 py-2 text-sm font-medium text-white hover:bg-rally-600"
              >
                Update
              </button>
              <button
                onClick={() => setSelected(null)}
                className="rounded-md border border-frost px-4 py-2 text-sm text-stone hover:bg-cream"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
