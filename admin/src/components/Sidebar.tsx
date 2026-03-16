import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Bell, Send, Menu, X } from 'lucide-react';

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

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {links.map(({ to, label, icon: Icon, ...rest }) => (
        <NavLink
          key={to}
          to={to}
          end={'end' in rest}
          onClick={onNavigate}
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
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-50 rounded-md bg-bark p-2 text-white shadow-lg md:hidden"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile slide-out sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-56 transform bg-bark text-white transition-transform duration-200 md:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between px-5">
          <div className="flex items-center">
            <span className="text-lg font-bold tracking-tight">RallyHUB</span>
            <span className="ml-2 rounded bg-gold px-1.5 py-0.5 text-[10px] font-bold uppercase text-bark">
              Admin
            </span>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
        <div className="mt-4">
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>
      </aside>

      {/* Desktop sidebar (always visible) */}
      <aside className="hidden w-56 flex-col bg-bark text-white md:flex">
        <div className="flex h-14 items-center px-5">
          <span className="text-lg font-bold tracking-tight">RallyHUB</span>
          <span className="ml-2 rounded bg-gold px-1.5 py-0.5 text-[10px] font-bold uppercase text-bark">
            Admin
          </span>
        </div>
        <div className="mt-4">
          <NavLinks />
        </div>
      </aside>
    </>
  );
}
