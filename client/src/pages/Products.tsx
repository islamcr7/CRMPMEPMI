import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { api, toQuery } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useMoney, useSettings } from '../lib/format';
import type { Product } from '../types';
import { Badge, Button, Card, EmptyState, ErrorBox, FormActions, Input, Modal, PageHeader, SearchInput, Select, Spinner, Textarea, useDebounce } from '../components/ui';
import { CsvImport, ExportButton } from '../components/CsvImport';

function ProductForm({ product, onClose }: { product?: Product; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const [f, setF] = useState({
    name: product?.name ?? '',
    sku: product?.sku ?? '',
    description: product?.description ?? '',
    unit: product?.unit ?? '',
    unitPrice: product ? String(Number(product.unitPrice)) : '',
    taxRate: String(Number(product?.taxRate ?? settings?.defaultTaxRate ?? 20)),
    active: product?.active ?? true,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, unitPrice: Number(f.unitPrice), taxRate: Number(f.taxRate) };
      return product ? api(`/products/${product.id}`, 'PATCH', body) : api('/products', 'POST', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Modal open onClose={onClose} title={product ? 'Modifier le produit' : 'Nouveau produit / service'}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={save.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nom *" value={f.name} onChange={set('name')} required autoFocus className="sm:col-span-2" />
          <Input label="Référence" value={f.sku} onChange={set('sku')} placeholder="ex. PRD-001" />
          <Input label="Unité" value={f.unit} onChange={set('unit')} placeholder="pièce, heure, jour, kg…" />
          <Input label="Prix unitaire HT *" type="number" step="0.01" value={f.unitPrice} onChange={set('unitPrice')} required />
          <Input label="TVA (%) *" type="number" step="0.01" min="0" max="100" value={f.taxRate} onChange={set('taxRate')} required />
          <Textarea label="Description" value={f.description} onChange={set('description')} className="sm:col-span-2" />
          {product && (
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="rounded border-slate-300" />
              Actif (proposé dans les devis et factures)
            </label>
          )}
        </div>
        <FormActions onCancel={onClose} loading={save.isPending} />
      </form>
    </Modal>
  );
}

export default function ProductsPage() {
  const money = useMoney();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [active, setActive] = useState('true');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const search = useDebounce(q);
  const { data, isLoading, error } = useQuery({
    queryKey: ['products', search, active],
    queryFn: () => api<Product[]>(`/products${toQuery({ q: search, active })}`),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/products/${id}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
    onError: (e) => alert(e.message),
  });

  return (
    <>
      <PageHeader
        title="Produits & services"
        subtitle="Catalogue réutilisable dans les devis et factures"
        actions={
          <>
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <Upload className="h-4 w-4" /> Importer
            </Button>
            <ExportButton entity="products" />
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> Nouveau produit
            </Button>
          </>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <SearchInput value={q} onChange={setQ} placeholder="Nom, référence…" />
          <Select value={active} onChange={(e) => setActive(e.target.value)} className="sm:w-44">
            <option value="true">Actifs</option>
            <option value="false">Archivés</option>
            <option value="all">Tous</option>
          </Select>
        </div>
        <ErrorBox error={error} />
        {isLoading ? (
          <Spinner />
        ) : !data?.length ? (
          <EmptyState title="Aucun produit">Ajoutez vos produits et prestations pour remplir vos devis en un clic.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Produit</th>
                  <th className="hidden px-4 py-2.5 sm:table-cell">Référence</th>
                  <th className="px-4 py-2.5 text-right">Prix HT</th>
                  <th className="hidden px-4 py-2.5 text-right sm:table-cell">TVA</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((p) => (
                  <tr key={p.id} className="group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-slate-900">
                        {p.name} {!p.active && <Badge>Archivé</Badge>}
                      </div>
                      {p.description && <div className="line-clamp-1 text-xs text-slate-400">{p.description}</div>}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{p.sku ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-800">
                      {money(p.unitPrice)}
                      {p.unit && <span className="text-xs text-slate-400"> / {p.unit}</span>}
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums text-slate-600 sm:table-cell">{Number(p.taxRate)} %</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button onClick={() => setEditing(p)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Modifier">
                        <Pencil className="h-4 w-4" />
                      </button>
                      {user?.role === 'ADMIN' && (
                        <button
                          onClick={() => confirm(`Supprimer « ${p.name} » ? Les devis et factures existants ne sont pas modifiés.`) && remove.mutate(p.id)}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <ProductForm product={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {importing && <CsvImport entity="products" onClose={() => setImporting(false)} />}
    </>
  );
}
