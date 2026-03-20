import { StatCard } from '@/components/StatCard';
import { useAdminData } from '@/hooks/useAdminData';
import { fetchDashboardStats, fetchLeadStats } from '@/lib/queries';

export function Dashboard() {
  const { data: stats, loading } = useAdminData(() => fetchDashboardStats());
  const { data: leadStats, loading: leadsLoading } = useAdminData(() => fetchLeadStats(), []);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-bark">Dashboard</h1>

      {loading ? (
        <p className="text-sm text-stone">Loading stats...</p>
      ) : stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Total Users" value={stats.totalUsers} />
          <StatCard label="Active Sessions (7d)" value={stats.activeSessionsWeek} />
          <StatCard label="Pending Errors" value={stats.pendingErrors} />
          <StatCard label="Feature Requests" value={stats.pendingFeatureRequests} sublabel="new / unreviewed" />
          {!leadsLoading && leadStats && (
            <>
              <StatCard label="Total Leads" value={leadStats.total} />
              <StatCard label="New Leads" value={leadStats.new} sublabel="awaiting invite" />
              <StatCard label="Invited" value={leadStats.invited} />
              <StatCard label="Signed Up" value={leadStats.signed_up} sublabel="converted" />
            </>
          )}
          <StatCard label="Referrals Sent" value={stats.totalReferrals} />
          <StatCard label="Referral Conversions" value={stats.convertedReferrals} sublabel="signed up from referral" />
        </div>
      ) : (
        <p className="text-sm text-red-500">Failed to load stats</p>
      )}
    </div>
  );
}
