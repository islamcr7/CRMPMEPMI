import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, toQuery } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Activity } from '../types';
import { Button, Card, ErrorBox, PageHeader, SearchInput, Select, Spinner, useDebounce } from '../components/ui';
import { ActivityForm } from '../components/forms';
import { ActivityList } from '../components/ActivityList';
import { useUsers } from '../components/pickers';

import { t } from '../lib/i18n';
const TABS = [
  { key: 'open', label: t('À faire'), params: { status: 'open' } },
  { key: 'overdue', label: t('En retard'), params: { status: 'open', range: 'overdue' } },
  { key: 'today', label: t('Aujourd’hui'), params: { status: 'open', range: 'today' } },
  { key: 'week', label: t('7 prochains jours'), params: { status: 'open', range: 'week' } },
  { key: 'done', label: t('Terminées'), params: { status: 'done' } },
] as const;

export default function ActivitiesPage() {
  const { user } = useAuth();
  const { data: users } = useUsers();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('open');
  const [assignee, setAssignee] = useState(user?.id ?? '');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const search = useDebounce(q);
  const params = TABS.find((t) => t.key === tab)!.params;

  const { data, isLoading, error } = useQuery({
    queryKey: ['activities', tab, assignee, search],
    queryFn: () => api<Activity[]>(`/activities${toQuery({ ...params, assigneeId: assignee, q: search })}`),
  });

  return (
    <>
      <PageHeader
        title={t("Activités")}
        subtitle={t("Appels, rendez-vous, relances et notes")}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> {t("Nouvelle activité")}
          </Button>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t.key ? 'bg-indigo-600 text-on-accent' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput value={q} onChange={setQ} />
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="sm:w-48">
              <option value="">{t("Toute l’équipe")}</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === user?.id ? t('Moi ({name})', { name: u.name }) : u.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <ErrorBox error={error} />
        {isLoading ? <Spinner /> : <ActivityList items={data ?? []} emptyText={t("Aucune activité dans cette vue")} />}
      </Card>
      {creating && <ActivityForm open onClose={() => setCreating(false)} />}
    </>
  );
}
