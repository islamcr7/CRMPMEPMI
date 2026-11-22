import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { api, toQuery } from '../lib/api';
import { useMoney } from '../lib/format';
import type { Product } from '../types';
import { useDebounce } from './ui';

/** Recherche dans le catalogue ; la sélection ajoute une ligne au document. */
export function ProductPicker({ onPick }: { onPick: (p: Product) => void }) {
  const money = useMoney();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const search = useDebounce(q, 200);
  const { data, isFetching } = useQuery({
    queryKey: ['products', search, 'true'],
    queryFn: () => api<Product[]>(`/products${toQuery({ q: search, active: 'true' })}`),
    enabled: open,
  });

  return (
    <div className="relative w-full sm:w-80">
      <Package className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Ajouter depuis le catalogue…"
        aria-label="Ajouter un produit du catalogue"
        className="block w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      />
      {open && (
        <ul className="absolute bottom-full z-20 mb-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg sm:bottom-auto sm:top-full sm:mb-0 sm:mt-1">
          {isFetching && !data && <li className="px-3 py-2 text-slate-400">Recherche…</li>}
          {data?.length === 0 && (
            <li className="px-3 py-2 text-slate-500">
              Aucun produit.{' '}
              <Link to="/products" className="text-indigo-600 hover:underline">
                Gérer le catalogue
              </Link>
            </li>
          )}
          {data?.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(p);
                  setQ('');
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-indigo-50"
              >
                <span className="min-w-0">
                  <span className="block truncate">{p.name}</span>
                  {p.sku && <span className="block text-xs text-slate-400">{p.sku}</span>}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-slate-500">
                  {money(p.unitPrice)}
                  {p.unit && ` / ${p.unit}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
