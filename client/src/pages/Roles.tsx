import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Lock, Plus, ShieldCheck, Trash2, Users as UsersIcon } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { t, tMaybe } from '../lib/i18n';
import type { AppRole, DataScope, PermissionCatalog } from '../types';
import { Badge, Button, Card, EmptyState, ErrorBox, Input, PageHeader, Spinner, Textarea } from '../components/ui';
import { confirmDialog, toast } from '../components/feedback';

interface Draft {
  id?: string;
  name: string;
  description: string;
  scope: DataScope;
  permissions: Set<string>;
  system: boolean;
}

const toDraft = (r: AppRole): Draft => ({ id: r.id, name: r.name, description: r.description ?? '', scope: r.scope, permissions: new Set(r.permissions), system: r.system });
const emptyDraft = (): Draft => ({ name: '', description: '', scope: 'OWN', permissions: new Set(), system: false });

/** Grille des droits : une ligne par module, une case par action. */
function PermissionGrid({ catalog, draft, onChange }: { catalog: PermissionCatalog; draft: Draft; onChange: (p: Set<string>) => void }) {
  const locked = (p: string) => draft.system && catalog.locked.includes(p);
  const toggle = (p: string) => {
    if (locked(p)) return;
    const next = new Set(draft.permissions);
    if (next.has(p)) {
      next.delete(p);
      // Sans « Voir », les autres droits du module n'ont pas de sens
      if (p.endsWith('.view')) [...next].filter((x) => x.startsWith(p.replace('.view', '.'))).forEach((x) => next.delete(x));
    } else {
      next.add(p);
      const view = p.replace(/\.[^.]+$/, '.view');
      if (catalog.modules.some((m) => m.actions.some((a) => a.key === view))) next.add(view);
    }
    onChange(next);
  };
  const toggleRow = (keys: string[]) => {
    const next = new Set(draft.permissions);
    const all = keys.every((k) => next.has(k));
    keys.forEach((k) => (all && !locked(k) ? next.delete(k) : next.add(k)));
    onChange(next);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{t('Droits du rôle')}</caption>
        <tbody className="divide-y divide-slate-100">
          {catalog.modules.map((m) => {
            const keys = m.actions.map((a) => a.key);
            const all = keys.every((k) => draft.permissions.has(k));
            return (
              <tr key={m.key}>
                <th scope="row" className="w-44 py-2.5 pr-3 text-left align-top">
                  <div className="font-medium text-slate-800">{tMaybe(m.label)}</div>
                  <button type="button" onClick={() => toggleRow(keys)} className="text-xs font-normal text-indigo-600 hover:underline">
                    {all ? t('Tout décocher') : t('Tout cocher')}
                  </button>
                </th>
                <td className="py-2.5">
                  <div className="flex flex-wrap gap-2">
                    {m.actions.map((a) => {
                      const on = draft.permissions.has(a.key);
                      const lock = locked(a.key);
                      return (
                        <label
                          key={a.key}
                          className={`inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            on ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          } ${lock ? 'cursor-not-allowed opacity-70' : ''}`}
                          title={lock ? t('Indispensable au rôle Administrateur') : undefined}
                        >
                          <input type="checkbox" checked={on} disabled={lock} onChange={() => toggle(a.key)} className="h-3.5 w-3.5 rounded border-slate-300 accent-indigo-600" />
                          {tMaybe(a.label)}
                          {lock && <Lock className="h-3 w-3" />}
                        </label>
                      );
                    })}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function RolesPage() {
  const qc = useQueryClient();
  const { user, refresh } = useAuth();
  const { data: roles, isLoading, error } = useQuery({ queryKey: ['roles'], queryFn: () => api<AppRole[]>('/roles') });
  const { data: catalog } = useQuery({ queryKey: ['roles-catalog'], queryFn: () => api<PermissionCatalog>('/roles/catalog'), staleTime: Infinity });
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  // Sélection par défaut : le premier rôle
  useEffect(() => {
    if (roles?.length && selected === null) setSelected(roles[0].id);
  }, [roles, selected]);
  useEffect(() => {
    if (selected === 'new') setDraft((d) => (d && !d.id ? d : emptyDraft()));
    else if (selected && roles) {
      const r = roles.find((x) => x.id === selected);
      if (r) setDraft(toDraft(r));
    }
  }, [selected, roles]);

  const current = useMemo(() => roles?.find((r) => r.id === selected), [roles, selected]);

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body = { name: d.name, description: d.description, scope: d.scope, permissions: [...d.permissions] };
      return d.id ? api<AppRole>(`/roles/${d.id}`, 'PATCH', body) : api<AppRole>('/roles', 'POST', body);
    },
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ['roles'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      setSelected(r.id);
      toast.success(t('Rôle « {name} » enregistré', { name: r.name }));
      if (r.id === user?.roleId) await refresh(); // ses propres droits ont changé
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/roles/${id}`, 'DELETE'),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['roles'] });
      setSelected(null);
      toast.success(t('Rôle supprimé'));
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !catalog) return <Spinner />;
  if (error || !roles) return <ErrorBox error={error} />;

  const duplicate = () => {
    if (!draft) return;
    setSelected('new');
    setDraft({ ...draft, id: undefined, system: false, name: t('{name} (copie)', { name: draft.name }) });
  };

  return (
    <>
      <PageHeader
        title={t('Rôles & droits')}
        subtitle={t('Définissez ce que chaque rôle peut voir et faire')}
        actions={
          <Button onClick={() => setSelected('new')}>
            <Plus className="h-4 w-4" /> {t('Nouveau rôle')}
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={t('Rôles')}>
          <ul className="divide-y divide-slate-100">
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelected(r.id)}
                  aria-current={selected === r.id}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 ${selected === r.id ? 'bg-indigo-50/60' : ''}`}
                >
                  <ShieldCheck className={`mt-0.5 h-4 w-4 shrink-0 ${r.system ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                      {tMaybe(r.name)} {r.system && <Lock className="h-3 w-3 text-slate-400" aria-label={t('Rôle système')} />}
                    </span>
                    {r.description && <span className="block truncate text-xs text-slate-500">{tMaybe(r.description)}</span>}
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone={r.scope === 'ALL' ? 'blue' : 'amber'}>{r.scope === 'ALL' ? t('Toutes les fiches') : t('Ses fiches')}</Badge>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <UsersIcon className="h-3 w-3" /> {r._count?.users ?? 0}
                      </span>
                      <span className="text-xs text-slate-400">· {t('{n} droits', { n: r.permissions.length })}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="lg:col-span-2">
          {!draft ? (
            <Card>
              <EmptyState title={t('Choisissez un rôle')} icon={ShieldCheck} />
            </Card>
          ) : (
            <Card
              title={draft.id ? t('Modifier le rôle') : t('Nouveau rôle')}
              actions={
                draft.id && (
                  <>
                    <Button size="sm" variant="ghost" onClick={duplicate}>
                      <Copy className="h-3.5 w-3.5" /> {t('Dupliquer')}
                    </Button>
                    {!draft.system && (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={(current?._count?.users ?? 0) > 0}
                        title={(current?._count?.users ?? 0) > 0 ? t('Ce rôle est attribué à des utilisateurs : changez d’abord leur rôle') : undefined}
                        onClick={async () =>
                          (await confirmDialog({ title: t('Supprimer le rôle « {name} » ?', { name: draft.name }), confirmLabel: t('Supprimer'), danger: true })) && remove.mutate(draft.id!)
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </>
                )
              }
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate(draft);
                }}
                className="space-y-5 p-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label={t('Nom du rôle *')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required maxLength={60} />
                  <Textarea label={t('Description')} rows={1} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </div>

                <fieldset>
                  <legend className="mb-2 text-xs font-medium text-slate-600">{t('Fiches visibles')}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(['ALL', 'OWN'] as const).map((s) => (
                      <label
                        key={s}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${draft.scope === s ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200 hover:bg-slate-50'} ${
                          draft.system && s === 'OWN' ? 'cursor-not-allowed opacity-50' : ''
                        }`}
                      >
                        <input type="radio" name="scope" checked={draft.scope === s} disabled={draft.system && s === 'OWN'} onChange={() => setDraft({ ...draft, scope: s })} className="mt-0.5 accent-indigo-600" />
                        <span>
                          <span className="block font-medium text-slate-800">{s === 'ALL' ? t('Toutes les fiches') : t('Seulement ses fiches')}</span>
                          <span className="block text-xs text-slate-500">
                            {s === 'ALL' ? t('Voit les fiches de toute l’équipe') : t('Ne voit que les fiches dont il est responsable (et ses activités, devis et factures)')}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <div className="mb-1 text-xs font-medium text-slate-600">{t('Droits')}</div>
                  <PermissionGrid catalog={catalog} draft={draft} onChange={(permissions) => setDraft({ ...draft, permissions })} />
                  {draft.system && <p className="mt-2 text-xs text-slate-500">{t('Le rôle Administrateur garde toujours la gestion des utilisateurs et des rôles, pour éviter de perdre l’accès.')}</p>}
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  {draft.id && current && (
                    <Button type="button" variant="secondary" onClick={() => setDraft(toDraft(current))}>
                      {t('Annuler les modifications')}
                    </Button>
                  )}
                  <Button type="submit" loading={save.isPending}>
                    {t('Enregistrer le rôle')}
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
