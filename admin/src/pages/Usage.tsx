import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useAdminData } from '@/hooks/useAdminData';
import { fetchSessionStats, fetchNotificationStats } from '@/lib/queries';

export function Usage() {
  const { data: sessions, loading: sessionsLoading } = useAdminData(
    () => fetchSessionStats(30),
    []
  );
  const { data: notifications, loading: notifsLoading } = useAdminData(
    () => fetchNotificationStats(30),
    []
  );

  // Aggregate sessions by day
  const sessionsByDay = useMemo(() => {
    if (!sessions) return [];
    const map = new Map<string, { date: string; sessions: number; uniqueUsers: Set<string> }>();
    for (const s of sessions) {
      const day = new Date(s.started_at).toISOString().slice(0, 10);
      if (!map.has(day)) map.set(day, { date: day, sessions: 0, uniqueUsers: new Set() });
      const entry = map.get(day)!;
      entry.sessions++;
      entry.uniqueUsers.add(s.user_id);
    }
    return Array.from(map.values())
      .map((e) => ({ date: e.date, sessions: e.sessions, uniqueUsers: e.uniqueUsers.size }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [sessions]);

  // Aggregate notifications by channel
  const notifsByChannel = useMemo(() => {
    if (!notifications) return [];
    const map = new Map<string, number>();
    for (const n of notifications) {
      map.set(n.channel, (map.get(n.channel) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([channel, count]) => ({ channel, count }));
  }, [notifications]);

  const loading = sessionsLoading || notifsLoading;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-bark">Usage Metrics</h1>

      {loading ? (
        <p className="text-sm text-stone">Loading...</p>
      ) : (
        <div className="space-y-8">
          {/* Sessions chart */}
          <div className="rounded-xl border border-frost bg-warm-white p-5">
            <h2 className="mb-4 text-lg font-semibold text-bark">Daily Sessions (30d)</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={sessionsByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D8E2EC" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#4A6E8A' }} />
                <YAxis tick={{ fontSize: 12, fill: '#4A6E8A' }} />
                <Tooltip />
                <Line type="monotone" dataKey="sessions" stroke="#3B82B0" strokeWidth={2} name="Sessions" />
                <Line type="monotone" dataKey="uniqueUsers" stroke="#6A9E8A" strokeWidth={2} name="Unique Users" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Notifications chart */}
          <div className="rounded-xl border border-frost bg-warm-white p-5">
            <h2 className="mb-4 text-lg font-semibold text-bark">Notifications by Channel (30d)</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={notifsByChannel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D8E2EC" />
                <XAxis dataKey="channel" tick={{ fontSize: 12, fill: '#4A6E8A' }} />
                <YAxis tick={{ fontSize: 12, fill: '#4A6E8A' }} />
                <Tooltip />
                <Bar dataKey="count" fill="#3B82B0" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
