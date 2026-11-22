import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  CheckSquare,
  ChevronDown,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Package,
  Receipt,
  Settings,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/format';
import { useRecent, type RecentItem } from '../lib/recent';
import { Avatar } from './ui';

interface Counters {
  myOverdue: number;
  myToday: number;
  quotesPending: number;
  invoicesOverdue: number;
  openDeals: number;
}

type BadgeTone = 'neutral' | 'alert';
interface Item {
  to: string;
  label: string;
  icon: typeof Users;
  end?: boolean;
  badge?: (c: Counters) => { value: number; tone: BadgeTone; title: string } | null;
}
interface Group {
  key: string;
  label: string;
  items: Item[];
  admin?: boolean;
}

const GROUPS: Group[] = [
  {
    key: 'sales',
    label: 'Ventes',
    items: [
      { to: '/companies', label: 'Entreprises', icon: Building2 },
      { to: '/contacts', label: 'Contacts', icon: Users },
      {
        to: '/pipeline',
        label: 'Pipeline',
        icon: KanbanSquare,
        badge: (c) => (c.openDeals ? { value: c.openDeals, tone: 'neutral', title: `${c.openDeals} opportunité(s) en cours` } : null),
      },
      {
        to: '/activities',
        label: 'Activités',
        icon: CheckSquare,
        badge: (c) =>
          c.myOverdue
            ? { value: c.myOverdue, tone: 'alert', title: `${c.myOverdue} tâche(s) en retard` }
            : c.myToday
              ? { value: c.myToday, tone: 'neutral', title: `${c.myToday} tâche(s) aujourd’hui` }
              : null,
      },
    ],
  },
  {
    key: 'billing',
    label: 'Facturation',
    items: [
      {
        to: '/documents/quotes',
        label: 'Devis',
        icon: FileText,
        badge: (c) => (c.quotesPending ? { value: c.quotesPending, tone: 'neutral', title: `${c.quotesPending} devis en attente de réponse` } : null),
      },
      { to: '/documents/invoices', label: 'Factures', icon: Receipt },
      {
        to: '/collections',
        label: 'Recouvrement',
        icon: Wallet,
        badge: (c) => (c.invoicesOverdue ? { value: c.invoicesOverdue, tone: 'alert', title: `${c.invoicesOverdue} facture(s) en retard de paiement` } : null),
      },
      { to: '/products', label: 'Produits', icon: Package },
    ],
  },
  {
    key: 'admin',
    label: 'Administration',
    admin: true,
    items: [
      { to: '/users', label: 'Utilisateurs', icon: UserCog },
      { to: '/settings', label: 'Paramètres', icon: Settings },
    ],
  },
];

const RECENT_ICONS: Record<RecentItem['kind'], typeof Users> = { company: Building2, contact: Users, deal: KanbanSquare, document: FileText };
const STORAGE_KEY = 'crm-sidebar-collapsed';

function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

function Badge({ value, tone, title }: { value: number; tone: BadgeTone; title: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className={`ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none tabular-nums ${
        tone === 'alert' ? 'bg-red-600 text-on-accent' : 'bg-slate-200/80 text-slate-600'
      }`}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}

/** Menu latéral : rubriques repliables, compteurs, fiches récentes et profil. */
export function Sidebar({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  const { data: org } = useSettings();
  const recent = useRecent();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsed);
  const { data: counters } = useQuery({
    queryKey: ['counters'],
    queryFn: () => api<Counters>('/counters'),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  const toggle = (key: string) =>
    setCollapsed((c) => {
      const next = { ...c, [key]: !c[key] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignoré */
      }
      return next;
    });

  const isActive = (to: string) => location.pathname === to || location.pathname.startsWith(`${to}/`);
  const groups = GROUPS.filter((g) => !g.admin || user?.role === 'ADMIN');

  const header = (key: string, label: string, attention?: boolean) => {
    const isCollapsed = !!collapsed[key];
    return (
      <button
        onClick={() => toggle(key)}
        aria-expanded={!isCollapsed}
        aria-controls={`nav-${key}`}
        className="flex w-full items-center gap-1.5 rounded-md px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600"
      >
        {label}
        {isCollapsed && attention && <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-label="éléments à traiter" />}
        <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-on-accent">C</div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">CRM PME</div>
          <div className="truncate text-xs text-slate-500">{org?.name}</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3 [scrollbar-width:thin]" aria-label="Navigation principale">
        <NavLink to="/" end className={linkCls}>
          <LayoutDashboard className="h-4 w-4" /> Tableau de bord
        </NavLink>

        {groups.map((g) => {
          // Une rubrique repliée reste visible si elle contient la page courante
          const open = !collapsed[g.key] || g.items.some((i) => isActive(i.to));
          const attention = !!counters && g.items.some((i) => i.badge?.(counters)?.tone === 'alert');
          return (
            <div key={g.key}>
              {header(g.key, g.label, attention)}
              {open && (
                <ul id={`nav-${g.key}`} className="space-y-0.5">
                  {g.items.map((it) => {
                    const b = counters && it.badge?.(counters);
                    return (
                      <li key={it.to}>
                        <NavLink to={it.to} end={it.end} className={linkCls}>
                          <it.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{it.label}</span>
                          {b && <Badge {...b} />}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}

        {recent.length > 0 && (
          <div>
            {header('recent', 'Récents')}
            {!collapsed.recent && (
              <ul id="nav-recent" className="space-y-0.5">
                {recent.slice(0, 5).map((r) => {
                  const Icon = RECENT_ICONS[r.kind];
                  return (
                    <li key={`${r.kind}-${r.id}`}>
                      <NavLink to={r.to} className={linkCls} title={r.sub ? `${r.title} — ${r.sub}` : r.title}>
                        <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="min-w-0">
                          <span className="block truncate font-normal">{r.title}</span>
                          {r.sub && <span className="block truncate text-xs font-normal text-slate-400">{r.sub}</span>}
                        </span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          {user && <Avatar name={user.name} />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-800">{user?.name}</div>
            <div className="truncate text-xs text-slate-500">{user?.role === 'ADMIN' ? 'Administrateur' : 'Commercial'}</div>
          </div>
          <button onClick={onLogout} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Se déconnecter" aria-label="Se déconnecter">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
