import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Receipt, Target, TrendingUp, Trophy, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useMoney } from '../lib/format';
import { STAGES } from '../lib/labels';
import type { Dashboard } from '../types';
import { Card, ErrorBox, PageHeader, Spinner } from '../components/ui';
import { ActivityList } from '../components/ActivityList';
import { GlobalSearch } from '../components/GlobalSearch';

function Kpi({ label, value, sub, icon: Icon, to, alert }: { label: string; value: string; sub?: string; icon: typeof Users; to?: string; alert?: boolean }) {
  const body = (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow">
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className="mt-1 truncate text-xl font-semibold tabular-nums text-slate-900">{value}</div>
        {sub && <div className={`mt-0.5 text-xs ${alert ? 'font-medium text-red-600' : 'text-slate-500'}`}>{sub}</div>}
      </div>
      <div className={`rounded-lg p-2 ${alert ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export default function DashboardPage() {
  const { user } = useAuth();
  const money = useMoney();
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') });

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error} />;

  const maxMonth = Math.max(1, ...data.wonByMonth.map((m) => m.amount));
  const openStages = data.stages.filter((s) => s.stage !== 'WON' && s.stage !== 'LOST');
  const maxStage = Math.max(1, ...openStages.map((s) => s.amount));

  return (
    <>
      <PageHeader title={`Bonjour ${user?.name.split(' ')[0]} 👋`} subtitle="Vue d’ensemble de votre activité commerciale" />

      <div className="mb-6">
        <GlobalSearch />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Pipeline en cours" value={money(data.pipeline.value, true)} sub={`${data.pipeline.openCount} opportunités · pondéré ${money(data.pipeline.weighted, true)}`} icon={Target} to="/pipeline" />
        <Kpi
          label="Gagné ce mois"
          value={money(data.wonThisMonth, true)}
          sub={data.pipeline.winRate !== null ? `Taux de transformation ${data.pipeline.winRate} %` : undefined}
          icon={Trophy}
        />
        <Kpi
          label="Factures à encaisser"
          value={money(data.invoices.unpaidTotal, true)}
          sub={data.invoices.overdueCount > 0 ? `${data.invoices.overdueCount} en retard (${money(data.invoices.overdueTotal, true)})` : `${data.invoices.unpaidCount} facture(s) envoyée(s)`}
          alert={data.invoices.overdueCount > 0}
          icon={Receipt}
          to="/collections"
        />
        <Kpi
          label="Tâches en retard"
          value={String(data.activities.overdue)}
          sub={`${data.contacts.total} contacts · +${data.contacts.newThisMonth} ce mois`}
          alert={data.activities.overdue > 0}
          icon={data.activities.overdue > 0 ? AlertTriangle : Users}
          to="/activities"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Mes tâches du jour et en retard" className="lg:col-span-2" actions={<Link to="/activities" className="text-xs font-medium text-indigo-600 hover:underline">Tout voir</Link>}>
          <ActivityList items={data.activities.myTasks} emptyText="Rien à faire aujourd’hui 🎉" />
        </Card>

        <Card title="Pipeline par étape">
          <div className="space-y-3 p-4">
            {openStages.map((s) => (
              <div key={s.stage}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-slate-700">
                    {STAGES.find((x) => x.value === s.stage)?.label} <span className="text-slate-400">({s.count})</span>
                  </span>
                  <span className="tabular-nums text-slate-600">{money(s.amount, true)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${(s.amount / maxStage) * 100}%` }} />
                </div>
              </div>
            ))}
            <p className="pt-2 text-xs text-slate-500">
              CA encaissé cette année : <span className="font-medium text-slate-700">{money(data.invoices.paidThisYear)}</span>
            </p>
          </div>
        </Card>

        <Card title="Affaires gagnées (6 derniers mois)" className="lg:col-span-2">
          <div className="flex h-48 items-end gap-3 px-4 pb-4 pt-6">
            {data.wonByMonth.map((m) => {
              const month = MONTHS[Number(m.month.slice(5)) - 1];
              return (
                <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[11px] tabular-nums text-slate-500">{m.amount > 0 ? money(m.amount, true) : ''}</span>
                  <div className="w-full max-w-12 rounded-t-md bg-emerald-500/80" style={{ height: `${Math.max(2, (m.amount / maxMonth) * 100)}%` }} title={money(m.amount)} />
                  <span className="text-xs text-slate-500">{month}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Activité récente">
          <ActivityList items={data.activities.recent} emptyText="Aucune activité terminée" />
        </Card>
      </div>

      <div className="mt-6 flex items-center gap-2 text-xs text-slate-400">
        <TrendingUp className="h-3.5 w-3.5" /> {data.companiesTotal} entreprises suivies
      </div>
    </>
  );
}
