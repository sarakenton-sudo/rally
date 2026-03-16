import { StatCard } from '@/components/StatCard';
import { useAdminData } from '@/hooks/useAdminData';
import { fetchDashboardStats } from '@/lib/queries';

export function Dashboard() {
  const { data: stats, loading } = useAdminData(() => fetchDashboardStats());

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-bark">Dashboard</h1>

      {loading ? (
        <p className="text-sm text-stone">Loading stats...</p>
      ) : stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Users" value={stats.totalUsers} />
          <StatCard label="Active Sessions (7d)" value={stats.activeSessionsWeek} />
          <StatCard label="Pending Errors" value={stats.pendingErrors} />
          <StatCard label="Feature Requests" value={stats.pendingFeatureRequests} sublabel="new / unreviewed" />
        </div>
      ) : (
        <p className="text-sm text-red-500">Failed to load stats</p>
      )}
    </div>
  );
}
