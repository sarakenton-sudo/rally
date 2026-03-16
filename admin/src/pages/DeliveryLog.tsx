import { useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { useAdminData } from '@/hooks/useAdminData';
import { fetchDeliveryLog } from '@/lib/queries';

interface DeliveryRow {
  id: string;
  user_email: string;
  notification_type: string;
  channel: string;
  message: string;
  status: string;
  sent_at: string;
  delivered_at: string | null;
}

const col = createColumnHelper<DeliveryRow>();

const columns = [
  col.accessor('sent_at', {
    header: 'Sent At',
    cell: (info) => new Date(info.getValue()).toLocaleString(),
  }),
  col.accessor('notification_type', {
    header: 'Type',
    cell: (info) => (
      <span className="capitalize text-sm">{info.getValue().replace(/_/g, ' ')}</span>
    ),
  }),
  col.accessor('channel', {
    header: 'Channel',
    cell: (info) => <StatusBadge value={info.getValue()} />,
  }),
  col.accessor('user_email', {
    header: 'Recipient',
    cell: (info) => (
      <span className="max-w-[12rem] truncate block text-sm">{info.getValue()}</span>
    ),
  }),
  col.accessor('message', {
    header: 'Message',
    cell: (info) => (
      <span className="max-w-xs truncate block">{info.getValue()}</span>
    ),
  }),
  col.accessor('status', {
    header: 'Status',
    cell: (info) => <StatusBadge value={info.getValue()} />,
  }),
];

export function DeliveryLog() {
  const [channelFilter, setChannelFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);

  const { data, loading } = useAdminData(
    () =>
      fetchDeliveryLog({
        channel: channelFilter || undefined,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
      }),
    [channelFilter, typeFilter, statusFilter, dateFrom, dateTo, page]
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-bark">Delivery Log</h1>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
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
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(0);
          }}
          className="rounded-md border border-frost px-2 py-1.5 text-sm text-bark"
        >
          <option value="">All types</option>
          <option value="tournament_reminder">Tournament Reminder</option>
          <option value="cancellation_deadline">Cancellation Deadline</option>
          <option value="schedule_change">Schedule Change</option>
          <option value="rsvp_request">RSVP Request</option>
          <option value="custom">Custom / Email-triggered</option>
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
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
          <option value="bounced">Bounced</option>
        </select>

        <div className="flex items-center gap-2">
          <label className="text-xs text-stone">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(0);
            }}
            className="rounded-md border border-frost px-2 py-1.5 text-sm text-bark"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-stone">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(0);
            }}
            className="rounded-md border border-frost px-2 py-1.5 text-sm text-bark"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-stone">Loading...</p>
      ) : (
        <>
          <DataTable<DeliveryRow>
            data={(data as DeliveryRow[]) ?? []}
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
