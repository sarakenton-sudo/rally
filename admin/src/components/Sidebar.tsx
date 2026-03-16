import { NavLink } from 'react-router-dom';

import { Bell, Send } from 'lucide-react';

const links = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/accounts', label: 'Accounts' },
  { to: '/admin/usage', label: 'Usage' },
  { to: '/admin/errors', label: 'Errors' },
  { to: '/admin/feature-requests', label: 'Feature Requests' },
  { to: '/admin/imports', label: 'Imports' },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell },
  { to: '/admin/delivery-log', label: 'Delivery Log', icon: Send },
  { to: '/admin/reports', label: 'Reports' },
];

export function Sidebar() {
  return (
    <aside className="flex w-56 flex-col bg-bark text-white">
      <div className="flex h-14 items-center px-5">
        <span className="text-lg font-bold tracking-tight">RallyHUB</span>
        <span className="ml-2 rounded bg-gold px-1.5 py-0.5 text-[10px] font-bold uppercase text-bark">
          Admin
        </span>
      </div>
      <nav className="mt-4 flex flex-col gap-1 px-3">
        {links.map(({ to, label, icon: Icon, ...rest }) => (
          <NavLink
            key={to}
            to={to}
            end={'end' in rest}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-bark-light text-white'
                  : 'text-rally-200 hover:bg-bark-light hover:text-white'
              }`
            }
          >
            {Icon && <Icon size={16} />}
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
