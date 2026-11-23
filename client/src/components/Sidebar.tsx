import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  CheckSquare,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/format';
import { useRecent, type RecentItem } from '../lib/recent';
import { Avatar } from './ui';

import { t, tMaybe } from '../lib/i18n';
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
  /** Droit requis pour voir ce lien */
  perm: string;
  badge?: (c: Counters) => { value: number; tone: BadgeTone; title: string } | null;
}
interface Group {
  key: string;
  label: string;
  items: Item[];
}

const GROUPS: Group[] = [
  {
    key: 'sales',
    label: t('Ventes'),
    items: [
      { to: '/companies', label: t('Entreprises'), icon: Building2, perm: 'companies.view' },
      { to: '/contacts', label: t('Contacts'), icon: Users, perm: 'contacts.view' },
      {
        to: '/pipeline',
        label: t('Pipeline'),
        icon: KanbanSquare,
        perm: 'deals.view',
        badge: (c) => (c.openDeals ? { value: c.openDeals, tone: 'neutral', title: t('{n} opportunité(s) en cours', { n: c.openDeals }) } : null),
      },
      {
        to: '/activities',
        label: t('Activités'),
        icon: CheckSquare,
        perm: 'activities.view',
        badge: (c) =>
          c.myOverdue
            ? { value: c.myOverdue, tone: 'alert', title: t('{n} tâche(s) en retard', { n: c.myOverdue }) }
            : c.myToday
              ? { value: c.myToday, tone: 'neutral', title: t('{n} tâche(s) aujourd’hui', { n: c.myToday }) }
              : null,
      },
    ],
  },
  {
    key: 'billing',
    label: t('Facturation'),
    items: [
      {
        to: '/documents/quotes',
        label: t('Devis'),
        icon: FileText,
        perm: 'quotes.view',
        badge: (c) => (c.quotesPending ? { value: c.quotesPending, tone: 'neutral', title: t('{n} devis en attente de réponse', { n: c.quotesPending }) } : null),
      },
      { to: '/documents/invoices', label: t('Factures'), icon: Receipt, perm: 'invoices.view' },
      {
        to: '/collections',
        label: t('Recouvrement'),
        icon: Wallet,
        perm: 'invoices.view',
        badge: (c) => (c.invoicesOverdue ? { value: c.invoicesOverdue, tone: 'alert', title: t('{n} facture(s) en retard de paiement', { n: c.invoicesOverdue }) } : null),
      },
      { to: '/products', label: t('Produits'), icon: Package, perm: 'products.view' },
    ],
  },
  {
    key: 'admin',
    label: t('Administration'),
    items: [
      { to: '/users', label: t('Utilisateurs'), icon: UserCog, perm: 'admin.users' },
      { to: '/roles', label: t('Rôles & droits'), icon: ShieldCheck, perm: 'admin.roles' },
      { to: '/settings', label: t('Paramètres'), icon: Settings, perm: 'admin.settings' },
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

function Badge({ value, tone, title, mini }: { value: number; tone: BadgeTone; title: string; mini?: boolean }) {
  const color = tone === 'alert' ? 'bg-red-600 text-on-accent' : 'bg-slate-200 text-slate-600';
  if (mini) {
    // Menu réduit : pastille posée sur l'icône
    return (
      <span aria-label={title} className={`absolute -right-1 -top-1 min-w-4 rounded-full px-1 text-center text-[9px] font-bold leading-4 tabular-nums ring-2 ring-white ${color}`}>
        {value > 9 ? '9+' : value}
      </span>
    );
  }
  return (
    <span title={title} aria-label={title} className={`ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none tabular-nums ${color}`}>
      {value > 99 ? '99+' : value}
    </span>
  );
}

/**
 * Menu latéral : rubriques repliables, compteurs, fiches récentes et profil.
 * `compact` : version réduite (icônes seules, info-bulles au survol).
 */
export function Sidebar({ onLogout, compact = false, onToggleCompact }: { onLogout: () => void; compact?: boolean; onToggleCompact?: () => void }) {
  const { user, can } = useAuth();
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
  // Liens filtrés selon les droits du rôle ; une rubrique vide disparaît
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => can(i.perm)) })).filter((g) => g.items.length > 0);

  const linkCls = ({ isActive: active }: { isActive: boolean }) =>
    `relative flex items-center rounded-lg text-sm font-medium transition-colors ${compact ? 'h-10 w-10 justify-center' : 'gap-3 px-3 py-2'} ${
      active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  const header = (key: string, label: string, attention?: boolean) => {
    if (compact) return <div className="mx-auto my-2 h-px w-8 bg-slate-200" role="separator" aria-label={label} />;
    const isCollapsed = !!collapsed[key];
    return (
      <button
        onClick={() => toggle(key)}
        aria-expanded={!isCollapsed}
        aria-controls={`nav-${key}`}
        className="flex w-full items-center gap-1.5 rounded-md px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600"
      >
        {label}
        {isCollapsed && attention && <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-label={t("éléments à traiter")} />}
        <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className={`flex items-center gap-2 py-5 ${compact ? 'justify-center px-2' : 'px-4'}`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-on-accent" title={compact ? `CRM PME — ${org?.name ?? ''}` : undefined}>
          {t("C")}
        </div>
        {!compact && (
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">{t("CRM PME")}</div>
            <div className="truncate text-xs text-slate-500">{org?.name}</div>
          </div>
        )}
      </div>

      <nav className={`flex-1 overflow-y-auto pb-3 [scrollbar-width:thin] ${compact ? 'flex flex-col items-center px-2' : 'px-3'}`} aria-label={t("Navigation principale")}>
        <NavLink to="/" end className={linkCls} title={compact ? t('Tableau de bord') : undefined} aria-label={compact ? t('Tableau de bord') : undefined}>
          <LayoutDashboard className="h-4 w-4 shrink-0" /> {!compact && t('Tableau de bord')}
        </NavLink>

        {groups.map((g) => {
          // Une rubrique repliée reste visible si elle contient la page courante
          const open = compact || !collapsed[g.key] || g.items.some((i) => isActive(i.to));
          const attention = !!counters && g.items.some((i) => i.badge?.(counters)?.tone === 'alert');
          return (
            <div key={g.key} className={compact ? 'flex flex-col items-center' : undefined}>
              {header(g.key, g.label, attention)}
              {open && (
                <ul id={`nav-${g.key}`} className={compact ? 'space-y-1' : 'space-y-0.5'}>
                  {g.items.map((it) => {
                    const b = counters && it.badge?.(counters);
                    const tip = b ? `${it.label} — ${b.title}` : it.label;
                    return (
                      <li key={it.to}>
                        <NavLink to={it.to} className={linkCls} title={compact ? tip : undefined} aria-label={compact ? tip : undefined}>
                          <it.icon className="h-4 w-4 shrink-0" />
                          {!compact && <span className="truncate">{it.label}</span>}
                          {b && <Badge {...b} mini={compact} />}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}

        {!compact && recent.length > 0 && (
          <div>
            {header('recent', t('Récents'))}
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

      {onToggleCompact && (
        <div className={`border-t border-slate-200 py-2 ${compact ? 'flex justify-center px-2' : 'px-3'}`}>
          <button
            onClick={onToggleCompact}
            title={compact ? t('Déployer le menu (Ctrl+B)') : t('Réduire le menu (Ctrl+B)')}
            aria-label={compact ? t('Déployer le menu') : t('Réduire le menu')}
            aria-expanded={!compact}
            className={`flex items-center rounded-lg text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800 ${compact ? 'h-10 w-10 justify-center' : 'w-full gap-3 px-3 py-2'}`}
          >
            {compact ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!compact && (
              <>
                {t("Réduire le menu")}
                <kbd className="ml-auto rounded border border-slate-200 px-1 font-sans text-[10px] text-slate-400">{t("Ctrl B")}</kbd>
              </>
            )}
          </button>
        </div>
      )}

      <div className={`border-t border-slate-200 ${compact ? 'flex flex-col items-center gap-1 px-2 py-3' : 'p-3'}`}>
        {compact ? (
          <>
            {user && (
              <span title={`${user.name} — ${tMaybe(user.roleName)}`}>
                <Avatar name={user.name} />
              </span>
            )}
            <button onClick={onLogout} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title={t("Se déconnecter")} aria-label={t("Se déconnecter")}>
              <LogOut className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3 px-2 py-2">
            {user && <Avatar name={user.name} />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-800">{user?.name}</div>
              <div className="truncate text-xs text-slate-500">{user?.roleName && tMaybe(user.roleName)}</div>
            </div>
            <button onClick={onLogout} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title={t("Se déconnecter")} aria-label={t("Se déconnecter")}>
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
