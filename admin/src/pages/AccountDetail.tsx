import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useAdminData } from '@/hooks/useAdminData';
import { fetchAdminNotes, createAdminNote, fetchUsers } from '@/lib/queries';

export function AccountDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { admin } = useAdminAuth();
  const [newNote, setNewNote] = useState('');

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

      <h1 className="mb-2 text-2xl font-bold text-bark">
        {user.display_name || user.email}
      </h1>
      <p className="mb-6 text-sm text-stone">{user.email}</p>

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
