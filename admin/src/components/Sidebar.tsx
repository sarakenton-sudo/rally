import { NavLink } from 'react-router-dom';

const links = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/accounts', label: 'Accounts' },
  { to: '/admin/usage', label: 'Usage' },
  { to: '/admin/errors', label: 'Errors' },
  { to: '/admin/feature-requests', label: 'Feature Requests' },
  { to: '/admin/imports', label: 'Imports' },
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
        {links.map(({ to, label, ...rest }) => (
          <NavLink
            key={to}
            to={to}
            end={'end' in rest}
            className={({ isActive }) =>
              `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-bark-light text-white'
                  : 'text-rally-200 hover:bg-bark-light hover:text-white'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
