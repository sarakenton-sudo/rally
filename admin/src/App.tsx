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
import { Imports } from '@/pages/Imports';
import { Notifications } from '@/pages/Notifications';
import { NotificationDetail } from '@/pages/NotificationDetail';
import { DeliveryLog } from '@/pages/DeliveryLog';
import { EmailTemplates } from '@/pages/EmailTemplates';
import { EmailDetail } from '@/pages/EmailDetail';
import { Leads } from '@/pages/Leads';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { admin, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-cream">
        <div className="text-stone text-sm">Loading...</div>
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
          <Route path="imports" element={<Imports />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="notifications/:templateId" element={<NotificationDetail />} />
          <Route path="delivery-log" element={<DeliveryLog />} />
          <Route path="emails" element={<EmailTemplates />} />
          <Route path="emails/:templateId" element={<EmailDetail />} />
          <Route path="leads" element={<Leads />} />
          <Route path="reports" element={<Reports />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
