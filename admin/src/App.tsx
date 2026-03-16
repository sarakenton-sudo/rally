import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Layout } from '@/components/Layout';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Accounts } from '@/pages/Accounts';
import { AccountDetail } from '@/pages/AccountDetail';
import { Usage } from '@/pages/Usage';
import { Errors } from '@/pages/Errors';
import { FeatureRequests } from '@/pages/FeatureRequests';
import { Reports } from '@/pages/Reports';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { admin, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!admin) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<Login />} />
        <Route
          path="/admin"
          element={
            <AuthGuard>
              <Layout />
            </AuthGuard>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="accounts/:userId" element={<AccountDetail />} />
          <Route path="usage" element={<Usage />} />
          <Route path="errors" element={<Errors />} />
          <Route path="feature-requests" element={<FeatureRequests />} />
          <Route path="reports" element={<Reports />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
