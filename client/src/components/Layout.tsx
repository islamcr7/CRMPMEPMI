import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Building2, CheckSquare, FileText, KanbanSquare, LayoutDashboard, LogOut, Menu, Package, Receipt, Settings, UserCog, Users, Wallet, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/format';

const NAV = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/companies', label: 'Entreprises', icon: Building2 },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { to: '/activities', label: 'Activités', icon: CheckSquare },
  { to: '/documents/quotes', label: 'Devis', icon: FileText },
  { to: '/documents/invoices', label: 'Factures', icon: Receipt },
  { to: '/collections', label: 'Recouvrement', icon: Wallet },
  { to: '/products', label: 'Produits', icon: Package },
];

const ADMIN_NAV = [
  { to: '/users', label: 'Utilisateurs', icon: UserCog },
  { to: '/settings', label: 'Paramètres', icon: Settings },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { data: org } = useSettings();
  const [open, setOpen] = useState(false);

  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">C</div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">CRM PME</div>
          <div className="truncate text-xs text-slate-500">{org?.name}</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={link} onClick={() => setOpen(false)}>
            <Icon className="h-4 w-4" /> {label}
          </NavLink>
        ))}
        {user?.role === 'ADMIN' && (
          <>
            <div className="px-3 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Administration</div>
            {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={link} onClick={() => setOpen(false)}>
                <Icon className="h-4 w-4" /> {label}
              </NavLink>
            ))}
          </>
        )}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
            {user?.name
              .split(' ')
              .map((p) => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-800">{user?.name}</div>
            <div className="truncate text-xs text-slate-500">{user?.role === 'ADMIN' ? 'Administrateur' : 'Commercial'}</div>
          </div>
          <button onClick={logout} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Se déconnecter" aria-label="Se déconnecter">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <aside className="no-print hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>

      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-5 text-slate-400" aria-label="Fermer le menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} className="text-slate-600" aria-label="Ouvrir le menu">
            <Menu className="h-6 w-6" />
          </button>
          <span className="font-semibold text-slate-900">CRM PME</span>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
