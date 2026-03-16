import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useAdminData } from '@/hooks/useAdminData';
import { fetchAdminNotes, createAdminNote, fetchUsers } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

export function AccountDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { admin } = useAdminAuth();
  const [newNote, setNewNote] = useState('');
  const [impersonating, setImpersonating] = useState(false);

  const { data: users } = useAdminData(
    () => fetchUsers(undefined, 0, 10000),
    []
  );
  const user = users?.find((u: { user_id: string }) => u.user_id === userId);

  const { data: notes, refresh: refreshNotes } = useAdminData(
    () => (userId ? fetchAdminNotes(userId) : Promise.resolve([])),
    [userId]
  );

  async function handleAddNote() {
    if (!newNote.trim() || !admin || !userId) return;
    await createAdminNote(admin.id, userId, newNote.trim());
    setNewNote('');
    refreshNotes();
  }

  async function handleImpersonate() {
    if (!userId || !admin) return;
    setImpersonating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No session');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-impersonate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ target_user_id: userId }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate link');

      // Open the magic link in a new tab — user sees the consumer app as that user
      window.open(data.url, '_blank');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Impersonation failed');
    } finally {
      setImpersonating(false);
    }
  }

  if (!user) {
    return (
      <div>
        <button onClick={() => navigate(-1)} className="mb-4 text-sm text-rally-500 hover:underline">
          &larr; Back
        </button>
        <p className="text-sm text-stone">Loading user...</p>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-4 text-sm text-rally-500 hover:underline">
        &larr; Back to Accounts
      </button>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-bark">
            {user.display_name || user.email}
          </h1>
          <p className="text-sm text-stone">{user.email}</p>
        </div>
        {admin?.role === 'owner' && (
          <button
            onClick={handleImpersonate}
            disabled={impersonating}
            className="rounded-md border border-rally-500 px-4 py-2 text-sm font-medium text-rally-600 hover:bg-rally-50 disabled:opacity-50"
          >
            {impersonating ? 'Generating...' : 'View as User'}
          </button>
        )}
      </div>

      {/* User stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-frost bg-warm-white p-4">
          <p className="text-xs text-stone">Role</p>
          <p className="text-lg font-semibold text-bark">{user.role ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-frost bg-warm-white p-4">
          <p className="text-xs text-stone">Tournaments</p>
          <p className="text-lg font-semibold text-bark">{user.tournament_count}</p>
        </div>
        <div className="rounded-lg border border-frost bg-warm-white p-4">
          <p className="text-xs text-stone">Bookings</p>
          <p className="text-lg font-semibold text-bark">{user.booking_count}</p>
        </div>
        <div className="rounded-lg border border-frost bg-warm-white p-4">
          <p className="text-xs text-stone">Sessions</p>
          <p className="text-lg font-semibold text-bark">{user.session_count}</p>
        </div>
      </div>

      {/* Admin Notes */}
      <h2 className="mb-3 text-lg font-semibold text-bark">Admin Notes</h2>
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a note about this user..."
          className="flex-1 rounded-md border border-frost px-3 py-2 text-sm text-bark focus:border-rally-500 focus:outline-none focus:ring-1 focus:ring-rally-500"
          onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
        />
        <button
          onClick={handleAddNote}
          disabled={!newNote.trim()}
          className="rounded-md bg-rally-500 px-4 py-2 text-sm font-medium text-white hover:bg-rally-600 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {notes?.map((note: { id: string; note: string; created_at: string }) => (
          <div key={note.id} className="rounded-lg border border-frost bg-warm-white p-3">
            <p className="text-sm text-bark">{note.note}</p>
            <p className="mt-1 text-xs text-stone">
              {new Date(note.created_at).toLocaleString()}
            </p>
          </div>
        ))}
        {notes?.length === 0 && (
          <p className="text-sm text-stone">No notes yet</p>
        )}
      </div>
    </div>
  );
}
