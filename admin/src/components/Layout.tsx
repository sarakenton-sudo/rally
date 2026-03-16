import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAdminAuth } from '@/hooks/useAdminAuth';

export function Layout() {
  const { admin, signOut } = useAdminAuth();

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div />
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500">{admin?.email}</span>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {admin?.role}
            </span>
            <button
              onClick={signOut}
              className="text-sm text-slate-400 hover:text-slate-600"
            >
              Sign out
            </button>
          </div>
        </header>
        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
