import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { useAdminData } from '@/hooks/useAdminData';
import { fetchNotificationTemplates } from '@/lib/queries';

interface TemplateRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  channels: string[];
  title: string;
  body: string;
  is_active: boolean;
  status: string;
  updated_at: string;
}

const col = createColumnHelper<TemplateRow>();

const columns = [
  col.accessor('status', {
    header: 'Status',
    cell: (info) => <StatusBadge value={info.getValue()} />,
  }),
  col.accessor('is_active', {
    header: 'Active',
    cell: (info) => (
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${
          info.getValue() ? 'bg-sage' : 'bg-stone/40'
        }`}
        title={info.getValue() ? 'Active' : 'Inactive'}
      />
    ),
  }),
  col.accessor('slug', {
    header: 'Name',
    cell: (info) => (
      <span className="font-mono text-xs">{info.getValue()}</span>
    ),
  }),
  col.accessor('category', {
    header: 'Category',
    cell: (info) => (
      <span className="capitalize text-sm">{info.getValue()}</span>
    ),
  }),
  col.accessor('channels', {
    header: 'Channels',
    cell: (info) => (
      <div className="flex gap-1">
        {(info.getValue() ?? []).map((ch) => (
          <StatusBadge key={ch} value={ch} />
        ))}
      </div>
    ),
  }),
  col.accessor('title', {
    header: 'Title',
    cell: (info) => (
      <span className="max-w-xs truncate block">{info.getValue()}</span>
    ),
  }),
  col.accessor('updated_at', {
    header: 'Updated',
    cell: (info) => new Date(info.getValue()).toLocaleDateString(),
  }),
];

export function Notifications() {
  const navigate = useNavigate();
  const [channelFilter, setChannelFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);

  const { data, loading } = useAdminData(
    () =>
      fetchNotificationTemplates({
        channel: channelFilter || undefined,
        category: categoryFilter || undefined,
        status: statusFilter || undefined,
        page,
      }),
    [channelFilter, categoryFilter, statusFilter, page]
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-bark">Message Library</h1>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <select
          value={channelFilter}
          onChange={(e) => {
            setChannelFilter(e.target.value);
            setPage(0);
          }}
          className="rounded-md border border-frost px-2 py-1.5 text-sm text-bark"
        >
          <option value="">All channels</option>
          <option value="push">Push</option>
          <option value="sms">SMS</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(0);
          }}
          className="rounded-md border border-frost px-2 py-1.5 text-sm text-bark"
        >
          <option value="">All categories</option>
          <option value="tournament">Tournament</option>
          <option value="travel">Travel</option>
          <option value="email">Email</option>
          <option value="guest">Guest</option>
          <option value="system">System</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(0);
          }}
          className="rounded-md border border-frost px-2 py-1.5 text-sm text-bark"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-stone">Loading...</p>
      ) : (
        <>
          <DataTable<TemplateRow>
            data={(data as TemplateRow[]) ?? []}
            columns={columns}
            onRowClick={(row) => navigate(`/admin/notifications/${row.id}`)}
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
