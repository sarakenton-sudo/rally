import { useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useAdminData } from '@/hooks/useAdminData';
import { fetchAdminUsers, addAdminUser, updateAdminUserRole, deleteAdminUser } from '@/lib/queries';

interface AdminUserRow {
  id: string;
  email: string;
  role: string;
  created_at: string;
  last_login_at: string | null;
}

const col = createColumnHelper<AdminUserRow>();

const columns = [
  col.accessor('email', {
    header: 'Email',
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  col.accessor('role', {
    header: 'Role',
    cell: (info) => <StatusBadge value={info.getValue()} />,
  }),
  col.accessor('created_at', {
    header: 'Added',
    cell: (info) => new Date(info.getValue()).toLocaleDateString(),
  }),
  col.accessor('last_login_at', {
    header: 'Last Login',
    cell: (info) => info.getValue() ? new Date(info.getValue()!).toLocaleDateString() : <span className="text-stone">Never</span>,
  }),
];

export function AdminUsers() {
  const { admin } = useAdminAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<'owner' | 'cs_rep'>('cs_rep');
  const [addError, setAddError] = useState('');
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [editRole, setEditRole] = useState<'owner' | 'cs_rep'>('cs_rep');

  const { data, loading, refresh } = useAdminData(() => fetchAdminUsers(), []);

  const isOwner = admin?.role === 'owner';

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    if (!addEmail.trim()) return;
    try {
      await addAdminUser(addEmail, addRole);
      setAddEmail('');
      setAddRole('cs_rep');
      setShowAddForm(false);
      refresh();
    } catch (err: any) {
      if (err?.code === '23505') {
        setAddError('This email is already an admin.');
      } else {
        setAddError(err.message || 'Failed to add admin user.');
      }
    }
  }

  async function handleUpdateRole() {
    if (!selected) return;
    try {
      await updateAdminUserRole(selected.id, editRole);
      setSelected(null);
      refresh();
    } catch (err: any) {
      alert('Failed to update role: ' + (err.message || 'Unknown error'));
    }
  }

  async function handleDelete() {
    if (!selected) return;
    if (selected.email === admin?.email) {
      alert("You can't remove yourself.");
      return;
    }
    if (!confirm(`Remove ${selected.email} from admin?`)) return;
    try {
      await deleteAdminUser(selected.id);
      setSelected(null);
      refresh();
    } catch (err: any) {
      alert('Failed to remove: ' + (err.message || 'Unknown error'));
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-bark">Admin Users</h1>
          <p className="mt-1 text-sm text-stone">
            Manage who has access to this admin panel
          </p>
        </div>
        {isOwner && (
          <button
            onClick={() => setShowAddForm(true)}
            className="rounded-md bg-rally-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rally-600"
          >
            + Add Admin
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-stone">Loading...</p>
      ) : (
        <DataTable<AdminUserRow>
          data={(data as AdminUserRow[]) ?? []}
          columns={columns}
          onRowClick={(row) => {
            if (!isOwner) return;
            setSelected(row);
            setEditRole(row.role as 'owner' | 'cs_rep');
          }}
        />
      )}

      {/* Add Admin Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddForm(false)}>
          <div className="w-full max-w-md rounded-xl bg-warm-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-bark">Add Admin User</h2>
            <p className="mb-4 text-sm text-stone">
              This person will be able to sign into the admin panel. They must have (or create) a Supabase auth account with this email.
            </p>
            <form onSubmit={handleAdd}>
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-bark">Email *</label>
                <input
                  type="email"
                  required
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  className="w-full rounded-md border border-frost px-3 py-2 text-sm text-bark focus:border-rally-500 focus:outline-none focus:ring-1 focus:ring-rally-500"
                  placeholder="newadmin@example.com"
                />
              </div>
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-bark">Role</label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as 'owner' | 'cs_rep')}
                  className="w-full rounded-md border border-frost px-2 py-2 text-sm text-bark"
                >
                  <option value="cs_rep">CS Rep</option>
                  <option value="owner">Owner</option>
                </select>
                <p className="mt-1 text-xs text-stone">
                  Owners can manage admin users. CS Reps have read-only access.
                </p>
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

      {/* Edit/Delete Admin Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelected(null)}>
          <div className="w-full max-w-md rounded-xl bg-warm-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-bark">{selected.email}</h2>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-bark">Role</label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as 'owner' | 'cs_rep')}
                className="w-full rounded-md border border-frost px-2 py-2 text-sm text-bark"
              >
                <option value="cs_rep">CS Rep</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleUpdateRole}
                className="rounded-md bg-rally-500 px-4 py-2 text-sm font-medium text-white hover:bg-rally-600"
              >
                Update Role
              </button>
              {selected.email !== admin?.email && (
                <button
                  onClick={handleDelete}
                  className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
                >
                  Remove
                </button>
              )}
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
