import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Building2,
  CheckSquare,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Package,
  Receipt,
  Search,
  Settings,
  Sun,
  UserCog,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/format';
import { useTheme, type ThemePref } from '../lib/theme';
import { Avatar } from './ui';
import { CommandPalette } from './CommandPalette';

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

const THEMES: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'dark', label: 'Sombre', icon: Moon },
  { value: 'system', label: 'Automatique', icon: Monitor },
];

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Sélecteur de thème segmenté (clair / sombre / auto). */
function ThemeSwitch({ value, onChange }: { value: ThemePref; onChange: (t: ThemePref) => void }) {
  return (
    <div role="radiogroup" aria-label="Thème" className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {THEMES.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          title={label}
          aria-label={label}
          onClick={() => onChange(v)}
          className={`rounded-md p-1.5 transition-colors ${value === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-700'}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const { data: org } = useSettings();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [theme, setTheme] = useTheme();
  const location = useLocation();

  // Ctrl+K / ⌘K ouvre la palette depuis n'importe quelle page
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Fermer le menu mobile à chaque changement de page
  useEffect(() => setOpen(false), [location.pathname]);

  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-on-accent">C</div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">CRM PME</div>
          <div className="truncate text-xs text-slate-500">{org?.name}</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Navigation principale">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={link}>
            <Icon className="h-4 w-4" /> {label}
          </NavLink>
        ))}
        {user?.role === 'ADMIN' && (
          <>
            <div className="px-3 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Administration</div>
            {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={link}>
                <Icon className="h-4 w-4" /> {label}
              </NavLink>
            ))}
          </>
        )}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          {user && <Avatar name={user.name} />}
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
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="dialog-in absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-5 text-slate-400" aria-label="Fermer le menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6 lg:px-8">
          <button onClick={() => setOpen(true)} className="text-slate-600 lg:hidden" aria-label="Ouvrir le menu">
            <Menu className="h-6 w-6" />
          </button>
          <button
            onClick={() => setPalette(true)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-400 hover:border-slate-300 hover:text-slate-600 sm:max-w-md"
            aria-label="Ouvrir la recherche et les actions rapides"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="truncate">Rechercher, créer, naviguer…</span>
            <kbd className="ml-auto hidden shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-xs text-slate-400 sm:inline">{isMac ? '⌘' : 'Ctrl'} K</kbd>
          </button>
          <div className="ml-auto">
            <ThemeSwitch value={theme} onChange={setTheme} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>

      <CommandPalette open={palette} onClose={() => setPalette(false)} setTheme={setTheme} />
    </div>
  );
}
