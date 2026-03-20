import { useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { CSVExportButton } from '@/components/CSVExportButton';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useAdminData } from '@/hooks/useAdminData';
import { fetchLeads, fetchLeadStats, insertLead, inviteLead, inviteLeadsBulk } from '@/lib/queries';

interface LeadRow {
  id: string;
  email: string;
  phone: string | null;
  marketing_opt_in: boolean;
  status: string;
  source: string | null;
  invited_at: string | null;
  signed_up_at: string | null;
  created_at: string;
}

const col = createColumnHelper<LeadRow>();

const columns = [
  col.accessor('status', {
    header: 'Status',
    cell: (info) => <StatusBadge value={info.getValue()} />,
  }),
  col.accessor('email', {
    header: 'Email',
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  col.accessor('phone', {
    header: 'Phone',
    cell: (info) => info.getValue() || <span className="text-stone">—</span>,
  }),
  col.accessor('source', {
    header: 'Source',
    cell: (info) => <span className="text-xs text-stone">{info.getValue() ?? '—'}</span>,
  }),
  col.accessor('marketing_opt_in', {
    header: 'Marketing',
    cell: (info) => (
      <span className={`text-xs ${info.getValue() ? 'text-sage font-medium' : 'text-stone'}`}>
        {info.getValue() ? 'Yes' : 'No'}
      </span>
    ),
  }),
  col.accessor('created_at', {
    header: 'Applied',
    cell: (info) => new Date(info.getValue()).toLocaleDateString(),
  }),
  col.accessor('invited_at', {
    header: 'Invited',
    cell: (info) => info.getValue() ? new Date(info.getValue()!).toLocaleDateString() : <span className="text-stone">—</span>,
  }),
];

const statusOptions = ['new', 'invited', 'signed_up'];

export function Leads() {
  const { admin } = useAdminAuth();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<LeadRow | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addError, setAddError] = useState('');
  const [inviting, setInviting] = useState<string | null>(null);
  const [bulkInviting, setBulkInviting] = useState(false);

  const { data, loading, refresh } = useAdminData(
    () => fetchLeads({ status: statusFilter || undefined, search: search || undefined, page }),
    [statusFilter, search, page]
  );

  const { data: stats, refresh: refreshStats } = useAdminData(() => fetchLeadStats(), []);

  const refreshAll = () => { refresh(); refreshStats(); };

  async function handleAddLead(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    if (!addEmail.trim()) return;
    try {
      await insertLead(addEmail, addPhone || null, 'admin');
      setAddEmail('');
      setAddPhone('');
      setShowAddForm(false);
      refreshAll();
    } catch (err: any) {
      if (err?.code === '23505') {
        setAddError('This email is already on the list.');
      } else {
        setAddError(err.message || 'Failed to add lead.');
      }
    }
  }

  async function handleInvite(lead: LeadRow) {
    if (lead.status !== 'new') return;
    setInviting(lead.id);
    try {
      await inviteLead(lead.id);
      refreshAll();
    } catch (err: any) {
      alert('Failed to send invite: ' + (err.message || 'Unknown error'));
    } finally {
      setInviting(null);
    }
  }

  async function handleBulkInvite() {
    const newLeads = (data as LeadRow[] | null)?.filter((l) => l.status === 'new') ?? [];
    if (newLeads.length === 0) return;
    if (!confirm(`Send invites to ${newLeads.length} lead${newLeads.length !== 1 ? 's' : ''}?`)) return;
    setBulkInviting(true);
    try {
      await inviteLeadsBulk(newLeads.map((l) => l.id));
      refreshAll();
    } catch (err: any) {
      alert('Bulk invite failed: ' + (err.message || 'Unknown error'));
    } finally {
      setBulkInviting(false);
    }
  }

  const newCount = stats?.new ?? 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-bark">Leads</h1>
          {stats && (
            <p className="mt-1 text-sm text-stone">
              {stats.total} total &middot; {stats.new} new &middot; {stats.invited} invited &middot; {stats.signed_up} signed up
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CSVExportButton data={(data ?? []) as Record<string, unknown>[]} filename="rally-leads" />
          <button
            onClick={() => setShowAddForm(true)}
            className="rounded-md bg-rally-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rally-600"
          >
            + Add Lead
          </button>
          {newCount > 0 && (
            <button
              onClick={handleBulkInvite}
              disabled={bulkInviting}
              className="rounded-md bg-bark px-3 py-1.5 text-sm font-medium text-white hover:bg-bark-light disabled:opacity-50"
            >
              {bulkInviting ? 'Sending...' : `Invite All New (${newCount})`}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
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
        <input
          type="text"
          placeholder="Search email or phone..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="rounded-md border border-frost px-3 py-1.5 text-sm text-bark placeholder:text-stone focus:border-rally-500 focus:outline-none focus:ring-1 focus:ring-rally-500"
        />
      </div>

      {loading ? (
        <p className="text-sm text-stone">Loading...</p>
      ) : (
        <>
          <DataTable<LeadRow>
            data={(data as LeadRow[]) ?? []}
            columns={columns}
            onRowClick={(row) => setSelected(row)}
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

      {/* Add Lead Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddForm(false)}>
          <div className="w-full max-w-md rounded-xl bg-warm-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-bark">Add Lead</h2>
            <form onSubmit={handleAddLead}>
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-bark">Email *</label>
                <input
                  type="email"
                  required
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  className="w-full rounded-md border border-frost px-3 py-2 text-sm text-bark focus:border-rally-500 focus:outline-none focus:ring-1 focus:ring-rally-500"
                  placeholder="email@example.com"
                />
              </div>
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-bark">Phone</label>
                <input
                  type="tel"
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  className="w-full rounded-md border border-frost px-3 py-2 text-sm text-bark focus:border-rally-500 focus:outline-none focus:ring-1 focus:ring-rally-500"
                  placeholder="(555) 123-4567"
                />
              </div>
              {addError && <p className="mb-3 text-sm text-red-600">{addError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-md bg-rally-500 px-4 py-2 text-sm font-medium text-white hover:bg-rally-600"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setAddError(''); }}
                  className="rounded-md border border-frost px-4 py-2 text-sm text-stone hover:bg-cream"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lead Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelected(null)}>
          <div className="w-full max-w-md rounded-xl bg-warm-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-bark">Lead Detail</h2>
            <div className="mb-4 space-y-2 rounded-lg bg-cream p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone">Status</span>
                <StatusBadge value={selected.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone">Email</span>
                <span className="text-sm font-medium text-bark">{selected.email}</span>
              </div>
              {selected.phone && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone">Phone</span>
                  <span className="text-sm text-bark">{selected.phone}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone">Source</span>
                <span className="text-sm text-bark">{selected.source ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone">Marketing</span>
                <span className="text-sm text-bark">{selected.marketing_opt_in ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone">Applied</span>
                <span className="text-sm text-bark">{new Date(selected.created_at).toLocaleString()}</span>
              </div>
              {selected.invited_at && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone">Invited</span>
                  <span className="text-sm text-bark">{new Date(selected.invited_at).toLocaleString()}</span>
                </div>
              )}
              {selected.signed_up_at && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone">Signed Up</span>
                  <span className="text-sm text-bark">{new Date(selected.signed_up_at).toLocaleString()}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              {selected.status === 'new' && (
                <button
                  onClick={async () => {
                    const lead = selected;
                    setSelected(null);
                    await handleInvite(lead);
                  }}
                  disabled={inviting === selected.id}
                  className="rounded-md bg-rally-500 px-4 py-2 text-sm font-medium text-white hover:bg-rally-600 disabled:opacity-50"
                >
                  Send Invite
                </button>
              )}
              <button
                onClick={() => setSelected(null)}
                className="rounded-md border border-frost px-4 py-2 text-sm text-stone hover:bg-cream"
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
