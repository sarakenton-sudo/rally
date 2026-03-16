import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { useAdminData } from '@/hooks/useAdminData';
import { fetchUsers } from '@/lib/queries';

interface UserRow {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string | null;
  created_at: string;
  last_sign_in: string | null;
  tournament_count: number;
  booking_count: number;
  session_count: number;
}

const col = createColumnHelper<UserRow>();

const columns = [
  col.accessor('email', { header: 'Email' }),
  col.accessor('display_name', {
    header: 'Name',
    cell: (info) => info.getValue() || '—',
  }),
  col.accessor('role', { header: 'Role' }),
  col.accessor('tournament_count', { header: 'Tournaments' }),
  col.accessor('booking_count', { header: 'Bookings' }),
  col.accessor('session_count', { header: 'Sessions' }),
  col.accessor('created_at', {
    header: 'Joined',
    cell: (info) => new Date(info.getValue()).toLocaleDateString(),
  }),
  col.accessor('last_sign_in', {
    header: 'Last Sign In',
    cell: (info) => {
      const v = info.getValue();
      return v ? new Date(v).toLocaleDateString() : '—';
    },
  }),
];

export function Accounts() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const { data, loading } = useAdminData(
    () => fetchUsers(search || undefined, page),
    [search, page]
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Accounts</h1>

      <div className="mb-4 flex items-center gap-4">
        <input
          type="text"
          placeholder="Search by email or name..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="w-72 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : (
        <>
          <DataTable<UserRow>
            data={(data as UserRow[]) ?? []}
            columns={columns}
            onRowClick={(row) => navigate(`/admin/accounts/${row.user_id}`)}
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
    </div>
  );
}
