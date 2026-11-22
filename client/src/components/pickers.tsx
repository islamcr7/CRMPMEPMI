import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api, toQuery } from '../lib/api';
import { fullName } from '../lib/format';
import type { Company, Contact, Deal, Paginated, User } from '../types';
import { Field, Select, useDebounce } from './ui';

import { t } from '../lib/i18n';
type Kind = 'company' | 'contact' | 'deal';
interface Option {
  id: string;
  label: string;
  sub?: string;
}

async function fetchOptions(kind: Kind, q: string, companyId?: string | null): Promise<Option[]> {
  if (kind === 'company') {
    const r = await api<Paginated<Company>>(`/companies${toQuery({ q, pageSize: 20 })}`);
    return r.items.map((c) => ({ id: c.id, label: c.name, sub: c.city ?? undefined }));
  }
  if (kind === 'contact') {
    const r = await api<Paginated<Contact>>(`/contacts${toQuery({ q, pageSize: 20, companyId })}`);
    return r.items.map((c) => ({ id: c.id, label: fullName(c), sub: c.company?.name }));
  }
  const r = await api<Deal[]>(`/deals${toQuery({ q })}`);
  return r
    .filter((d) => !companyId || d.companyId === companyId)
    .slice(0, 20)
    .map((d) => ({ id: d.id, label: d.title, sub: d.company?.name }));
}

const PLACEHOLDER: Record<Kind, string> = {
  company: t('Rechercher une entreprise…'),
  contact: t('Rechercher un contact…'),
  deal: t('Rechercher une opportunité…'),
};

/** Champ de recherche avec liste déroulante, pour lier une fiche (entreprise, contact, opportunité). */
export function EntityPicker({
  kind,
  label,
  value,
  valueLabel,
  onChange,
  companyId,
  required,
}: {
  kind: Kind;
  label: string;
  value: string | null;
  valueLabel?: string | null;
  onChange: (id: string | null, label: string | null) => void;
  companyId?: string | null;
  required?: boolean;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(q, 250);
  const { data, isFetching } = useQuery({
    queryKey: ['picker', kind, debounced, companyId ?? null],
    queryFn: () => fetchOptions(kind, debounced, companyId),
    enabled: open,
  });

  return (
    <Field label={label + (required ? ' *' : '')}>
      {(id) =>
        value ? (
          <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
            <span className="truncate">{valueLabel || t('Sélectionné')}</span>
            <button type="button" onClick={() => onChange(null, null)} className="ml-2 text-slate-400 hover:text-slate-600" aria-label={t("Retirer")}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              id={id}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder={PLACEHOLDER[kind]}
              autoComplete="off"
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            {open && (
              <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
                {isFetching && !data && <li className="px-3 py-2 text-slate-400">{t("Recherche…")}</li>}
                {data?.length === 0 && <li className="px-3 py-2 text-slate-400">{t("Aucun résultat")}</li>}
                {data?.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onChange(o.id, o.label);
                        setQ('');
                        setOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-indigo-50"
                    >
                      <span className="truncate">{o.label}</span>
                      {o.sub && <span className="truncate text-xs text-slate-400">{o.sub}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      }
    </Field>
  );
}

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/users'), staleTime: 60_000 });
}

export function UserSelect({ label = t('Responsable'), value, onChange, allowEmpty = true }: { label?: string; value: string | null; onChange: (id: string | null) => void; allowEmpty?: boolean }) {
  const { data } = useUsers();
  return (
    <Select label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {allowEmpty && <option value="">{t("— Non attribué —")}</option>}
      {data
        ?.filter((u) => u.active || u.id === value)
        .map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
    </Select>
  );
}
