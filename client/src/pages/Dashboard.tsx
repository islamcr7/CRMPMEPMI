import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarCheck, History, Receipt, Target, Trophy, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useMoney, useSettings } from '../lib/format';
import { STAGES } from '../lib/labels';
import type { Dashboard } from '../types';
import { Card, ErrorBox, PageHeader, Skeleton } from '../components/ui';
import { ActivityList } from '../components/ActivityList';
import { GlobalSearch } from '../components/GlobalSearch';
import { GettingStarted } from '../components/GettingStarted';
import { GroupedBarChart, HorizontalBars, Legend, Segmented, ViewToggle, type Series } from '../components/charts';

import { locale, t } from '../lib/i18n';
// Noms de mois dans la langue de l'interface (clé « AAAA-MM »)
const monthDate = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5)) - 1, 1);
const monthShort = (k: string) => monthDate(k).toLocaleDateString(locale(), { month: 'short' });
const monthLong = (k: string) => monthDate(k).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });

const SERIES: Series[] = [
  { key: 'amount', label: t('Affaires gagnées (HT)'), color: 'var(--chart-1)' },
  { key: 'collected', label: t('Encaissements (TTC)'), color: 'var(--chart-2)' },
];
const FUNNEL_COLORS = ['var(--funnel-1)', 'var(--funnel-2)', 'var(--funnel-3)', 'var(--funnel-4)'];

function Kpi({ label, value, sub, icon: Icon, to, alert }: { label: string; value: string; sub?: string; icon: typeof Users; to?: string; alert?: boolean }) {
  const body = (
    <div className="group flex h-full items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
        {sub && (
          <div className={`mt-1 flex items-center gap-1 text-xs ${alert ? 'font-medium text-red-600' : 'text-slate-500'}`}>
            {alert && <AlertTriangle className="h-3 w-3 shrink-0" />}
            <span className="truncate">{sub}</span>
          </div>
        )}
      </div>
      <div className={`rounded-lg p-2 ${alert ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
      {body}
    </Link>
  ) : (
    body
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label={t("Chargement du tableau de bord")}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-32" />
            <Skeleton className="mt-2 h-2.5 w-40" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <Skeleton className="h-4 w-48" />
          <div className="mt-6 flex h-48 items-end gap-4">
            {[40, 65, 30, 80, 55, 70].map((h, i) => (
              <div key={i} className="flex flex-1" style={{ height: `${h}%` }}>
                <Skeleton className="flex-1" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <Skeleton className="h-4 w-36" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-2.5 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const money = useMoney();
  const { data: settings } = useSettings();
  const [months, setMonths] = useState<6 | 12>(6);
  const [table, setTable] = useState(false);
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['dashboard', months],
    queryFn: () => api<Dashboard>(`/dashboard?months=${months}`),
    placeholderData: keepPreviousData,
  });

  const currency = settings?.currency ?? 'EUR';
  const axisFmt = (v: number) => {
    try {
      return new Intl.NumberFormat(locale(), { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v);
    } catch {
      return String(v);
    }
  };

  const header = (
    <>
      <PageHeader title={t('Bonjour {name} 👋', { name: user?.name.split(' ')[0] })} subtitle={t("Vue d’ensemble de votre activité commerciale")} />
      <div className="mb-6">
        <GlobalSearch />
      </div>
    </>
  );

  if (isLoading) return (
    <>
      {header}
      <DashboardSkeleton />
    </>
  );
  if (error || !data) return <ErrorBox error={error} />;

  const openStages = data.stages.filter((s) => s.stage !== 'WON' && s.stage !== 'LOST');
  const totalWon = data.wonByMonth.reduce((s, m) => s + m.amount, 0);
  const totalCollected = data.wonByMonth.reduce((s, m) => s + m.collected, 0);

  return (
    <>
      {header}
      <GettingStarted setup={data.setup} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={t("Pipeline en cours")} value={money(data.pipeline.value, true)} sub={t('{n} opportunités · pondéré {amount}', { n: data.pipeline.openCount, amount: money(data.pipeline.weighted, true) })} icon={Target} to="/pipeline" />
        <Kpi
          label={t("Gagné ce mois")}
          value={money(data.wonThisMonth, true)}
          sub={data.pipeline.winRate !== null ? t('Taux de transformation {n} %', { n: data.pipeline.winRate }) : t('Aucune affaire clôturée')}
          icon={Trophy}
        />
        <Kpi
          label={t("Factures à encaisser")}
          value={money(data.invoices.unpaidTotal, true)}
          sub={data.invoices.overdueCount > 0 ? t('{n} en retard ({amount})', { n: data.invoices.overdueCount, amount: money(data.invoices.overdueTotal, true) }) : t('{n} facture(s) émise(s)', { n: data.invoices.unpaidCount })}
          alert={data.invoices.overdueCount > 0}
          icon={Receipt}
          to="/collections"
        />
        <Kpi
          label={t("Tâches en retard")}
          value={String(data.activities.overdue)}
          sub={data.activities.overdue > 0 ? t('À traiter en priorité') : t('{n} contacts · +{m} ce mois', { n: data.contacts.total, m: data.contacts.newThisMonth })}
          alert={data.activities.overdue > 0}
          icon={data.activities.overdue > 0 ? AlertTriangle : Users}
          to="/activities"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title={t("Ventes et encaissements")}
          actions={
            <>
              <Segmented
                label={t("Période")}
                value={months}
                onChange={setMonths}
                options={[
                  { value: 6, label: t('6 mois') },
                  { value: 12, label: t('12 mois') },
                ]}
              />
              <ViewToggle table={table} onChange={setTable} />
            </>
          }
        >
          <div className={`px-4 pb-4 pt-3 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Legend series={SERIES} />
              <p className="text-xs text-slate-500">
                {t("Sur la période :")} <span className="font-medium text-slate-800">{money(totalWon, true)}</span> {t("gagnés ·")}{' '}
                <span className="font-medium text-slate-800">{money(totalCollected, true)}</span> {t("encaissés")}
              </p>
            </div>
            {table ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t("Affaires gagnées et encaissements par mois")}</caption>
                  <thead className="text-left text-xs text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="py-2 font-medium">{t("Mois")}</th>
                      <th className="py-2 text-right font-medium">{t("Affaires gagnées (HT)")}</th>
                      <th className="py-2 text-right font-medium">{t("Nb")}</th>
                      <th className="py-2 text-right font-medium">{t("Encaissements (TTC)")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.wonByMonth.map((m) => (
                      <tr key={m.month}>
                        <td className="py-1.5 capitalize text-slate-700">{monthLong(m.month)}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-800">{money(m.amount)}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-500">{m.wonCount}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-800">{money(m.collected)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <GroupedBarChart
                data={data.wonByMonth}
                series={SERIES}
                category={(d) => monthShort(d.month)}
                categoryLong={(d) => monthLong(d.month)}
                value={(d, k) => (k === 'amount' ? d.amount : d.collected)}
                format={(v) => money(v)}
                formatAxis={axisFmt}
                extra={(d) => t('{n} affaire(s) gagnée(s)', { n: d.wonCount })}
                ariaLabel={t('Affaires gagnées et encaissements sur {n} mois', { n: months })}
              />
            )}
          </div>
        </Card>

        <Card title={t("Pipeline par étape")} actions={<Link to="/pipeline" className="text-xs font-medium text-indigo-600 hover:underline">{t("Ouvrir")}</Link>}>
          <div className="p-4">
            <HorizontalBars
              format={(v) => money(v, true)}
              rows={openStages.map((s, i) => ({
                key: s.stage,
                label: STAGES.find((x) => x.value === s.stage)?.label ?? s.stage,
                value: s.amount,
                color: FUNNEL_COLORS[i],
                detail: t('{n} opp.', { n: s.count }),
                tooltip: (
                  <>
                    <div className="font-semibold text-slate-800">{STAGES.find((x) => x.value === s.stage)?.label}</div>
                    <div className="text-slate-500">
                      {s.count} {t("opportunité(s) ·")} {money(s.amount)}
                    </div>
                    <div className="text-slate-500">{t("Panier moyen :")} {money(s.count ? s.amount / s.count : 0)}</div>
                  </>
                ),
              }))}
            />
            <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
              <div>
                <dt className="text-slate-500">{t("Valeur pondérée")}</dt>
                <dd className="mt-0.5 text-base font-semibold text-slate-900">{money(data.pipeline.weighted, true)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("Encaissé cette année")}</dt>
                <dd className="mt-0.5 text-base font-semibold text-slate-900">{money(data.invoices.paidThisYear, true)}</dd>
              </div>
            </dl>
          </div>
        </Card>

        <Card
          title={
            <span className="inline-flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-slate-400" /> {t("Mes tâches du jour et en retard")}
            </span>
          }
          className="lg:col-span-2"
          actions={
            <Link to="/activities" className="text-xs font-medium text-indigo-600 hover:underline">
              {t("Tout voir")}
            </Link>
          }
        >
          <ActivityList items={data.activities.myTasks} emptyText={t("Rien à faire aujourd’hui 🎉")} />
        </Card>

        <Card
          title={
            <span className="inline-flex items-center gap-2">
              <History className="h-4 w-4 text-slate-400" /> {t("Activité récente")}
            </span>
          }
        >
          <ActivityList items={data.activities.recent} emptyText={t("Aucune activité terminée")} />
        </Card>
      </div>
    </>
  );
}
