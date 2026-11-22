import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CalendarPlus,
  CheckSquare,
  FilePlus,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  Loader2,
  Moon,
  Package,
  Receipt,
  Search,
  Settings,
  Sun,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import type { ThemePref } from '../lib/theme';
import { ActivityForm, CompanyForm, ContactForm, DealForm } from './forms';
import { useSearchGroups } from './GlobalSearch';

interface Command {
  key: string;
  icon: typeof Search;
  title: string;
  sub?: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Palette de commandes (Ctrl+K / ⌘K) : actions rapides, navigation et recherche. */
export function CommandPalette({ open, onClose, setTheme }: { open: boolean; onClose: () => void; setTheme: (t: ThemePref) => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [form, setForm] = useState<'contact' | 'company' | 'deal' | 'activity' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { groups: searchGroups, isFetching, enabled } = useSearchGroups(q);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const go = (to: string) => () => navigate(to);

  const actions: Command[] = useMemo(
    () => [
      { key: 'a-contact', icon: UserPlus, title: 'Nouveau contact', keywords: 'creer ajouter personne', run: () => setForm('contact') },
      { key: 'a-company', icon: Building2, title: 'Nouvelle entreprise', keywords: 'creer ajouter societe client', run: () => setForm('company') },
      { key: 'a-deal', icon: KanbanSquare, title: 'Nouvelle opportunité', keywords: 'creer affaire vente deal', run: () => setForm('deal') },
      { key: 'a-activity', icon: CalendarPlus, title: 'Nouvelle activité', keywords: 'creer tache appel rendez-vous rdv relance', run: () => setForm('activity') },
      { key: 'a-quote', icon: FilePlus, title: 'Nouveau devis', keywords: 'creer proposition', run: go('/documents/new/QUOTE') },
      { key: 'a-invoice', icon: Receipt, title: 'Nouvelle facture', keywords: 'creer facturer', run: go('/documents/new/INVOICE') },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const pages: Command[] = useMemo(
    () => [
      { key: 'p-home', icon: LayoutDashboard, title: 'Tableau de bord', keywords: 'accueil dashboard', run: go('/') },
      { key: 'p-companies', icon: Building2, title: 'Entreprises', run: go('/companies') },
      { key: 'p-contacts', icon: Users, title: 'Contacts', run: go('/contacts') },
      { key: 'p-pipeline', icon: KanbanSquare, title: 'Pipeline', keywords: 'opportunites kanban', run: go('/pipeline') },
      { key: 'p-activities', icon: CheckSquare, title: 'Activités', keywords: 'taches agenda', run: go('/activities') },
      { key: 'p-quotes', icon: FileText, title: 'Devis', run: go('/documents/quotes') },
      { key: 'p-invoices', icon: Receipt, title: 'Factures & avoirs', run: go('/documents/invoices') },
      { key: 'p-collections', icon: Wallet, title: 'Recouvrement', keywords: 'impayes relances retard', run: go('/collections') },
      { key: 'p-products', icon: Package, title: 'Produits & services', keywords: 'catalogue', run: go('/products') },
      ...(user?.role === 'ADMIN'
        ? [
            { key: 'p-users', icon: Users, title: 'Utilisateurs', keywords: 'equipe admin', run: go('/users') },
            { key: 'p-settings', icon: Settings, title: 'Paramètres', keywords: 'entreprise tva devise', run: go('/settings') },
          ]
        : []),
      { key: 't-dark', icon: Moon, title: 'Passer en thème sombre', keywords: 'mode nuit dark', run: () => setTheme('dark') },
      { key: 't-light', icon: Sun, title: 'Passer en thème clair', keywords: 'mode jour light', run: () => setTheme('light') },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.role],
  );

  const sections = useMemo(() => {
    const nq = norm(q.trim());
    // Chaque mot saisi doit apparaître (« nouv con » trouve « Nouveau contact »)
    const tokens = nq.split(/\s+/).filter(Boolean);
    const match = (c: Command) => {
      const hay = norm(`${c.title} ${c.keywords ?? ''}`);
      return tokens.every((t) => hay.includes(t));
    };
    const result: { title: string; items: Command[] }[] = [];
    const a = actions.filter(match);
    const p = pages.filter(match);
    if (a.length) result.push({ title: 'Actions rapides', items: a });
    for (const g of searchGroups) {
      result.push({ title: g.title, items: g.items.map((i) => ({ key: i.key, icon: i.icon, title: i.title, sub: i.sub, run: go(i.to) })) });
    }
    if (p.length) result.push({ title: nq ? 'Pages' : 'Aller à', items: p });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, actions, pages, searchGroups]);

  const flat = sections.flatMap((s) => s.items);
  useEffect(() => setActive(0), [q, searchGroups.length]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (c: Command) => {
    onClose();
    c.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && flat[active]) {
      e.preventDefault();
      run(flat[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let index = -1;

  return (
    <>
      {open && (
        <div className="no-print fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]" onMouseDown={onClose}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Palette de commandes"
            className="dialog-in flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-slate-100 px-4">
              <Search className="h-5 w-5 shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Rechercher ou lancer une action…"
                aria-label="Commande ou recherche"
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-list"
                autoComplete="off"
                className="h-14 flex-1 bg-transparent text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              {isFetching && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
              <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-400">Échap</kbd>
            </div>
            <div ref={listRef} id="palette-list" role="listbox" className="overflow-y-auto py-2">
              {flat.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">{enabled && isFetching ? 'Recherche…' : `Aucun résultat pour « ${q} »`}</p>
              ) : (
                sections.map((s) => (
                  <div key={s.title} className="py-1">
                    <div className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{s.title}</div>
                    {s.items.map((c) => {
                      index++;
                      const i = index;
                      const Icon = c.icon;
                      return (
                        <button
                          key={c.key}
                          role="option"
                          aria-selected={i === active}
                          onMouseMove={() => active !== i && setActive(i)}
                          onClick={() => run(c)}
                          className={`flex w-full items-center gap-3 px-4 py-2 text-left ${i === active ? 'bg-indigo-50' : ''}`}
                        >
                          <Icon className={`h-4 w-4 shrink-0 ${i === active ? 'text-indigo-600' : 'text-slate-400'}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-slate-800">{c.title}</span>
                            {c.sub && <span className="block truncate text-xs text-slate-500">{c.sub}</span>}
                          </span>
                          {i === active && <ArrowRight className="h-4 w-4 shrink-0 text-indigo-500" />}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center gap-4 border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
              <span>
                <kbd className="font-sans">↑↓</kbd> naviguer
              </span>
              <span>
                <kbd className="font-sans">↵</kbd> ouvrir
              </span>
              <span className="ml-auto">
                <kbd className="font-sans">Ctrl K</kbd> pour rouvrir
              </span>
            </div>
          </div>
        </div>
      )}

      {form === 'contact' && <ContactForm open onClose={() => setForm(null)} onSaved={(c) => navigate(`/contacts/${c.id}`)} />}
      {form === 'company' && <CompanyForm open onClose={() => setForm(null)} onSaved={(c) => navigate(`/companies/${c.id}`)} />}
      {form === 'deal' && <DealForm open onClose={() => setForm(null)} />}
      {form === 'activity' && <ActivityForm open onClose={() => setForm(null)} />}
    </>
  );
}
