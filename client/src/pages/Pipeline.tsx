import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Calendar, Plus, Trash2 } from 'lucide-react';
import { api, toQuery } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, fullName, isOverdue, useMoney } from '../lib/format';
import { STAGES } from '../lib/labels';
import type { Deal, DealStage } from '../types';
import { Button, ErrorBox, PageHeader, SearchInput, Select, Spinner, useDebounce } from '../components/ui';
import { Owner } from '../components/OwnerCell';
import { DealForm } from '../components/forms';
import { ExportButton } from '../components/CsvImport';
import { confirmDialog, toast } from '../components/feedback';

import { t } from '../lib/i18n';
const COLUMN_ACCENT: Record<DealStage, string> = {
  NEW: 'border-t-slate-400',
  QUALIFIED: 'border-t-blue-500',
  PROPOSAL: 'border-t-indigo-500',
  NEGOTIATION: 'border-t-amber-500',
  WON: 'border-t-emerald-500',
  LOST: 'border-t-red-400',
};

export default function PipelinePage() {
  const { user, can } = useAuth();
  const money = useMoney();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const [showClosed, setShowClosed] = useState(true);
  const [creatingIn, setCreatingIn] = useState<DealStage | null>(null);
  const [dragOver, setDragOver] = useState<DealStage | null>(null);
  const search = useDebounce(q);
  const key = ['deals', search, mine];

  const { data: deals, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => api<Deal[]>(`/deals${toQuery({ q: search, ownerId: mine && user?.id })}`),
  });

  // Anciens liens /pipeline?deal=<id> : redirection vers la fiche opportunité
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const dealParam = params.get('deal');
  useEffect(() => {
    if (dealParam) navigate(`/deals/${dealParam}`, { replace: true });
  }, [dealParam, navigate]);

  const move = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: DealStage }) => api<Deal>(`/deals/${id}`, 'PATCH', { stage }),
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Deal[]>(key);
      qc.setQueryData<Deal[]>(key, (old) => old?.map((d) => (d.id === id ? { ...d, stage } : d)));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(e.message);
    },
    onSuccess: (d) => {
      if (d.stage === 'WON') toast.success(t('🎉 « {title} » gagnée !', { title: d.title }));
    },
    onSettled: () => qc.invalidateQueries(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/deals/${id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(t('Opportunité supprimée'));
    },
    onError: (e) => toast.error(e.message),
  });

  const columns = STAGES.filter((s) => showClosed || (s.value !== 'WON' && s.value !== 'LOST'));
  const open = deals?.filter((d) => d.stage !== 'WON' && d.stage !== 'LOST') ?? [];
  const total = open.reduce((s, d) => s + Number(d.amount), 0);
  const weighted = open.reduce((s, d) => s + (Number(d.amount) * d.probability) / 100, 0);

  return (
    <>
      <PageHeader
        title={t("Pipeline commercial")}
        subtitle={deals && t('{n} opportunités en cours · {total} · pondéré {weighted}', { n: open.length, total: money(total), weighted: money(weighted) })}
        actions={
          <>
          <ExportButton entity="deals" />
          {can('deals.create') && (
            <Button onClick={() => setCreatingIn('NEW')}>
              <Plus className="h-4 w-4" /> {t("Nouvelle opportunité")}
            </Button>
          )}
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={q} onChange={setQ} placeholder={t("Intitulé ou entreprise…")} />
        <Select value={mine ? 'mine' : 'all'} onChange={(e) => setMine(e.target.value === 'mine')} className="sm:w-48">
          <option value="all">{t("Toute l’équipe")}</option>
          <option value="mine">{t("Mes opportunités")}</option>
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="rounded border-slate-300" />
          {t("Afficher gagnées / perdues")}
        </label>
      </div>
      <ErrorBox error={error} />
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-4">
          <div className="flex min-w-max gap-4">
            {columns.map((col) => {
              const items = deals?.filter((d) => d.stage === col.value) ?? [];
              const sum = items.reduce((s, d) => s + Number(d.amount), 0);
              return (
                <div
                  key={col.value}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(col.value);
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    const id = e.dataTransfer.getData('text/plain');
                    const deal = deals?.find((d) => d.id === id);
                    if (deal && deal.stage !== col.value) move.mutate({ id, stage: col.value });
                  }}
                  className={`flex w-72 flex-col rounded-xl border-t-4 bg-slate-100/80 ${COLUMN_ACCENT[col.value]} ${dragOver === col.value ? 'ring-2 ring-indigo-400' : ''}`}
                >
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">
                        {col.label} <span className="font-normal text-slate-400">{items.length}</span>
                      </div>
                      <div className="text-xs tabular-nums text-slate-500">{money(sum)}</div>
                    </div>
                    {can('deals.create') && (
                    <button onClick={() => setCreatingIn(col.value)} className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700" aria-label={t('Ajouter dans {column}', { column: col.label })}>
                      <Plus className="h-4 w-4" />
                    </button>
                    )}
                  </div>
                  <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                    {items.map((d) => (
                      <div
                        key={d.id}
                        draggable={can('deals.edit')}
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', d.id)}
                        onClick={() => navigate(`/deals/${d.id}`)}
                        className="group cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:border-indigo-300 active:cursor-grabbing"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-medium text-slate-800">{d.title}</div>
                          {can('deals.delete') && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (await confirmDialog({ title: t('Supprimer « {name} » ?', { name: d.title }), message: t('Ses activités seront également supprimées.'), confirmLabel: t('Supprimer'), danger: true }))
                                remove.mutate(d.id);
                            }}
                            className="shrink-0 text-slate-300 opacity-0 hover:text-red-600 group-hover:opacity-100"
                            aria-label={t("Supprimer")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          )}
                        </div>
                        {d.company && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                            <Building2 className="h-3 w-3" /> {d.company.name}
                            {d.contact && ` · ${fullName(d.contact)}`}
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="font-semibold tabular-nums text-slate-800">{money(d.amount)}</span>
                          <span className="text-slate-400">{d.probability} %</span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-xs text-slate-400">
                          {d.expectedCloseDate ? (
                            <span className={`flex items-center gap-1 ${col.value !== 'WON' && col.value !== 'LOST' && isOverdue(d.expectedCloseDate) ? 'text-red-600' : ''}`}>
                              <Calendar className="h-3 w-3" /> {formatDate(d.expectedCloseDate)}
                            </span>
                          ) : (
                            <span />
                          )}
                          <Owner owner={d.owner} compact />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {creatingIn && <DealForm open defaults={{ stage: creatingIn }} onClose={() => setCreatingIn(null)} />}
    </>
  );
}
