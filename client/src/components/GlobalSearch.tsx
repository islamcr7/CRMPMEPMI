import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { KanbanSquare, Loader2, Receipt, Search, User, X } from 'lucide-react';
import { api, toQuery } from '../lib/api';
import { fullName, isOverdue, useMoney } from '../lib/format';
import { CONTACT_STATUSES, DOC_STATUSES, STAGES, label, tone } from '../lib/labels';
import type { ContactStatus, DealStage, DocumentStatus, Money } from '../types';
import { Badge, useDebounce } from './ui';

import { t } from '../lib/i18n';
interface SearchResults {
  contacts: { id: string; firstName: string; lastName: string; email: string | null; status: ContactStatus; company: { id: string; name: string } | null }[];
  deals: { id: string; title: string; amount: Money; stage: DealStage; company: { id: string; name: string } | null }[];
  invoices: { id: string; number: string; total: Money; status: DocumentStatus; dueDate: string | null; company: { id: string; name: string } }[];
}

export interface SearchItem {
  key: string;
  to: string;
  icon: typeof User;
  title: string;
  sub?: string;
  right?: ReactNode;
}
type Item = SearchItem;

/** Résultats groupés (contacts, opportunités, factures) – partagé par la barre de recherche et la palette Ctrl+K. */
export function useSearchGroups(q: string) {
  const money = useMoney();
  const search = useDebounce(q.trim(), 250);
  const enabled = search.length >= 2;

  const { data, isFetching } = useQuery({
    queryKey: ['search', search],
    queryFn: () => api<SearchResults>(`/search${toQuery({ q: search })}`),
    enabled,
    staleTime: 10_000,
  });

  const groups = useMemo(() => {
    if (!data || !enabled) return [];
    return [
      {
        title: t('Contacts'),
        items: data.contacts.map<Item>((c) => ({
          key: `c-${c.id}`,
          to: `/contacts/${c.id}`,
          icon: User,
          title: fullName(c),
          sub: [c.company?.name, c.email].filter(Boolean).join(' · '),
          right: <Badge tone={tone(CONTACT_STATUSES, c.status)}>{label(CONTACT_STATUSES, c.status)}</Badge>,
        })),
      },
      {
        title: t('Opportunités'),
        items: data.deals.map<Item>((d) => ({
          key: `d-${d.id}`,
          to: `/deals/${d.id}`,
          icon: KanbanSquare,
          title: d.title,
          sub: [d.company?.name, money(d.amount)].filter(Boolean).join(' · '),
          right: <Badge tone={tone(STAGES, d.stage)}>{label(STAGES, d.stage)}</Badge>,
        })),
      },
      {
        title: t('Factures'),
        items: data.invoices.map<Item>((i) => {
          const late = i.status === 'SENT' && isOverdue(i.dueDate);
          return {
            key: `i-${i.id}`,
            to: `/documents/${i.id}`,
            icon: Receipt,
            title: i.number.startsWith('BROUILLON-') ? t('Facture brouillon') : i.number,
            sub: `${i.company.name} · ${money(i.total)}`,
            right: late ? <Badge tone="red">{t("En retard")}</Badge> : <Badge tone={DOC_STATUSES[i.status].tone}>{DOC_STATUSES[i.status].label}</Badge>,
          };
        }),
      },
    ].filter((g) => g.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, enabled]);

  return { groups, isFetching, enabled, search };
}

/** Recherche globale (contacts, opportunités, factures) avec navigation au clavier. */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const { groups, isFetching, enabled, search } = useSearchGroups(q);

  const flat = groups.flatMap((g) => g.items);

  useEffect(() => setActive(0), [search]);

  // Fermer au clic à l'extérieur
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Raccourci « / » pour focaliser la recherche
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (item: Item) => {
    setOpen(false);
    navigate(item.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && flat[active]) {
      e.preventDefault();
      go(flat[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  let index = -1;
  const showPanel = open && enabled;

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t("Rechercher un contact, une opportunité, une facture…")}
          aria-label={t("Recherche globale")}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="global-search-results"
          autoComplete="off"
          className="block w-full rounded-xl border border-slate-200 bg-white py-3 pl-12 pr-20 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 [&::-webkit-search-cancel-button]:hidden"
        />
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          {q ? (
            <button
              onClick={() => {
                setQ('');
                inputRef.current?.focus();
              }}
              className="rounded p-0.5 text-slate-400 hover:text-slate-600"
              aria-label={t("Effacer")}
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-400 sm:inline">/</kbd>
          )}
        </div>
      </div>

      {showPanel && (
        <div id="global-search-results" role="listbox" className="absolute z-30 mt-2 max-h-[70vh] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-2 shadow-xl">
          {groups.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">{isFetching || search !== q.trim() ? t('Recherche…') : t('Aucun résultat pour « {q} »', { q: search })}</p>
          ) : (
            groups.map((g) => (
              <div key={g.title} className="py-1">
                <div className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.title}</div>
                {g.items.map((item) => {
                  index++;
                  const i = index;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(item)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left ${i === active ? 'bg-indigo-50' : ''}`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-800">{item.title}</div>
                        {item.sub && <div className="truncate text-xs text-slate-500">{item.sub}</div>}
                      </div>
                      <div className="shrink-0">{item.right}</div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
