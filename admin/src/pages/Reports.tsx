import { useState } from 'react';
import { CSVExportButton } from '@/components/CSVExportButton';
import { useAdminData } from '@/hooks/useAdminData';
import { fetchUsers, fetchErrors, fetchFeatureRequests, fetchSessionStats } from '@/lib/queries';

export function Reports() {
  const [exportType, setExportType] = useState<'users' | 'errors' | 'features' | 'sessions'>('users');

  const { data: users } = useAdminData(() => fetchUsers(undefined, 0, 10000), []);
  const { data: errors } = useAdminData(() => fetchErrors({ pageSize: 10000 }), []);
  const { data: features } = useAdminData(() => fetchFeatureRequests({ pageSize: 10000 }), []);
  const { data: sessions } = useAdminData(() => fetchSessionStats(90), []);

  const exportMap = {
    users: { data: users ?? [], filename: 'rally-users' },
    errors: { data: errors ?? [], filename: 'rally-errors' },
    features: { data: features ?? [], filename: 'rally-feature-requests' },
    sessions: { data: sessions ?? [], filename: 'rally-sessions' },
  };

  const current = exportMap[exportType];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Reports & Exports</h1>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">CSV Exports</h2>
        <p className="mb-4 text-sm text-slate-500">
          Download data as CSV for analysis in spreadsheets or BI tools.
        </p>

        <div className="mb-4 flex items-center gap-3">
          <select
            value={exportType}
            onChange={(e) => setExportType(e.target.value as typeof exportType)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="users">All Users</option>
            <option value="errors">Error Log</option>
            <option value="features">Feature Requests</option>
            <option value="sessions">Session Data (90d)</option>
          </select>
          <CSVExportButton
            data={current.data as Record<string, unknown>[]}
            filename={current.filename}
            label={`Download ${current.data.length} rows`}
          />
        </div>

        <p className="text-xs text-slate-400">
          {current.data.length} records available for export
        </p>
      </div>
    </div>
  );
}
