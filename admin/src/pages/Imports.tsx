import { useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { CSVExportButton } from '@/components/CSVExportButton';
import { useAdminData } from '@/hooks/useAdminData';
import { fetchEmails, fetchImportReport } from '@/lib/queries';

// ---- Import Attempts tab ----

interface ImportRow {
  id: string;
  user_id: string;
  user_email: string;
  import_type: string;
  item_count: number;
  occurred_at: string;
  metadata: Record<string, unknown>;
  was_completed: boolean;
}

const importCol = createColumnHelper<ImportRow>();

const importColumns = [
  importCol.accessor('was_completed', {
    header: 'Outcome',
    cell: (info) => (
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        info.getValue() ? 'bg-sage/20 text-sage' : 'bg-red-100 text-red-700'
      }`}>
        {info.getValue() ? 'Imported' : 'Abandoned'}
      </span>
    ),
  }),
  importCol.accessor('import_type', {
    header: 'Source',
    cell: (info) => {
      const v = info.getValue();
      const labels: Record<string, string> = {
        tournament_paste: 'Paste + AI: Tournaments',
        travel_paste: 'Paste + AI: Travel',
        tournament_details_paste: 'Paste + AI: Details',
        email_flight: 'Email: Flight',
        email_hotel: 'Email: Hotel',
      };
      return <span className="text-sm">{labels[v] ?? v}</span>;
    },
  }),
  importCol.accessor('user_email', { header: 'User' }),
  importCol.accessor('item_count', { header: 'Items' }),
  importCol.accessor('occurred_at', {
    header: 'When',
    cell: (info) => new Date(info.getValue()).toLocaleString(),
  }),
];

// ---- Email Activity tab ----

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

const emailCol = createColumnHelper<EmailRow>();

const emailColumns = [
  emailCol.accessor('source', {
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
  emailCol.accessor('subject', {
    header: 'Subject',
    cell: (info) => <span className="max-w-xs truncate block">{info.getValue()}</span>,
  }),
  emailCol.accessor('from_address', { header: 'From' }),
  emailCol.accessor('classification', {
    header: 'Classification',
    cell: (info) => {
      const v = info.getValue();
      return v ? <StatusBadge value={v} /> : <span className="text-stone">—</span>;
    },
  }),
  emailCol.accessor('action_taken', {
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
  emailCol.accessor('received_at', {
    header: 'Received',
    cell: (info) => new Date(info.getValue()).toLocaleString(),
  }),
];

type Tab = 'attempts' | 'emails';

export function Imports() {
  const [tab, setTab] = useState<Tab>('attempts');
  const [typeFilter, setTypeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [page, setPage] = useState(0);

  const { data: imports, loading: importsLoading } = useAdminData(
    () => fetchImportReport({ type: typeFilter || undefined, page }),
    [typeFilter, page]
  );

  const { data: emails, loading: emailsLoading } = useAdminData(
    () => fetchEmails({ source: sourceFilter || undefined, page }),
    [sourceFilter, page]
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-bark">Import Activity</h1>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-frost p-1 w-fit">
        <button
          onClick={() => { setTab('attempts'); setPage(0); }}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === 'attempts' ? 'bg-warm-white text-bark shadow-sm' : 'text-stone hover:text-bark'
          }`}
        >
          Import Attempts
        </button>
        <button
          onClick={() => { setTab('emails'); setPage(0); }}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === 'emails' ? 'bg-warm-white text-bark shadow-sm' : 'text-stone hover:text-bark'
          }`}
        >
          Email Activity
        </button>
      </div>

      {tab === 'attempts' && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
              className="rounded-md border border-frost px-2 py-1.5 text-sm text-bark"
            >
              <option value="">All types</option>
              <option value="paste">Paste + AI (all)</option>
              <option value="tournament_paste">Paste: Tournaments</option>
              <option value="travel_paste">Paste: Travel</option>
              <option value="tournament_details">Paste: Details</option>
              <option value="email">Email imports</option>
            </select>
            <CSVExportButton data={(imports ?? []) as Record<string, unknown>[]} filename="rally-import-attempts" />
          </div>

          {importsLoading ? (
            <p className="text-sm text-stone">Loading...</p>
          ) : (
            <>
              <DataTable<ImportRow>
                data={(imports as ImportRow[]) ?? []}
                columns={importColumns}
              />
              <div className="mt-4 flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded border border-frost px-3 py-1 text-sm text-bark disabled:opacity-40">Previous</button>
                <span className="text-sm text-stone">Page {page + 1}</span>
                <button onClick={() => setPage((p) => p + 1)} disabled={(imports?.length ?? 0) < 50} className="rounded border border-frost px-3 py-1 text-sm text-bark disabled:opacity-40">Next</button>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'emails' && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <select
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value); setPage(0); }}
              className="rounded-md border border-frost px-2 py-1.5 text-sm text-bark"
            >
              <option value="">All sources</option>
              <option value="forward">Forwarded emails</option>
              <option value="gmail">Gmail sync</option>
            </select>
            <CSVExportButton data={(emails ?? []) as Record<string, unknown>[]} filename="rally-emails" />
          </div>

          {emailsLoading ? (
            <p className="text-sm text-stone">Loading...</p>
          ) : (
            <>
              <DataTable<EmailRow>
                data={(emails as EmailRow[]) ?? []}
                columns={emailColumns}
              />
              <div className="mt-4 flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded border border-frost px-3 py-1 text-sm text-bark disabled:opacity-40">Previous</button>
                <span className="text-sm text-stone">Page {page + 1}</span>
                <button onClick={() => setPage((p) => p + 1)} disabled={(emails?.length ?? 0) < 50} className="rounded border border-frost px-3 py-1 text-sm text-bark disabled:opacity-40">Next</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
