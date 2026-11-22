import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Mail, Phone } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate, fullName, useMoney } from '../lib/format';
import type { Collections } from '../types';
import { Badge, Button, Card, EmptyState, ErrorBox, PageHeader, Spinner } from '../components/ui';

import { t, tMaybe } from '../lib/i18n';
const BUCKET_COLORS = ['bg-slate-400', 'bg-amber-400', 'bg-orange-500', 'bg-red-500', 'bg-red-700'];

export default function CollectionsPage() {
  const money = useMoney();
  const qc = useQueryClient();
  const [onlyLate, setOnlyLate] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['collections'], queryFn: () => api<Collections>('/collections') });

  const remind = useMutation({
    mutationFn: (id: string) => api<{ reminderCount: number; email: { to: string; subject: string; body: string } }>(`/documents/${id}/reminders`, 'POST'),
    onSuccess: ({ reminderCount, email }) => {
      qc.invalidateQueries();
      setNotice(t('Relance n°{n} enregistrée. Votre messagerie s’ouvre avec l’email prérempli.', { n: reminderCount }) + (email.to ? '' : ' ' + t('(aucune adresse email connue pour ce client)')));
      window.location.href = `mailto:${encodeURIComponent(email.to)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
    },
  });

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error} />;

  const items = onlyLate ? data.items.filter((i) => i.daysLate > 0) : data.items;
  const maxBucket = Math.max(1, ...data.buckets.map((b) => b.amount));

  return (
    <>
      <PageHeader title={t("Recouvrement")} subtitle={t("Factures émises non soldées, balance âgée et relances")} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">{t("Reste à encaisser")}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{money(data.summary.outstanding)}</div>
          <div className="text-xs text-slate-500">{data.summary.count} {t("facture(s)")}</div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 shadow-sm">
          <div className="text-xs font-medium text-red-700">{t("Dont en retard")}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-red-700">{money(data.summary.overdue)}</div>
          <div className="text-xs text-red-600">{data.summary.overdueCount} {t("facture(s) échue(s)")}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-xs font-medium text-slate-500">{t("Balance âgée")}</div>
          <div className="space-y-1">
            {data.buckets.map((b, i) => (
              <div key={b.key} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 text-slate-500">{tMaybe(b.label)}</span>
                <div className="h-2 flex-1 rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full ${BUCKET_COLORS[i]}`} style={{ width: `${(b.amount / maxBucket) * 100}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right tabular-nums text-slate-700">{money(b.amount, true)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}
      <ErrorBox error={remind.error} />

      <Card
        title={onlyLate ? t('Factures en retard') : t('Toutes les factures à encaisser')}
        actions={
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={onlyLate} onChange={(e) => setOnlyLate(e.target.checked)} className="rounded border-slate-300" />
            {t("En retard uniquement")}
          </label>
        }
      >
        {items.length === 0 ? (
          <EmptyState title={onlyLate ? t('Aucune facture en retard 🎉') : t('Aucune facture à encaisser')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">{t("Facture")}</th>
                  <th className="px-4 py-2.5">{t("Client")}</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">{t("Échéance")}</th>
                  <th className="px-4 py-2.5 text-right">{t("Reste dû")}</th>
                  <th className="hidden px-4 py-2.5 lg:table-cell">{t("Relances")}</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((i) => {
                  const email = i.contact?.email ?? i.company.email;
                  const phone = i.contact?.phone ?? i.company.phone;
                  return (
                    <tr key={i.id}>
                      <td className="px-4 py-3">
                        <Link to={`/documents/${i.id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                          {i.number}
                        </Link>
                        <div className="text-xs text-slate-400">{formatDate(i.issueDate)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/companies/${i.company.id}`} className="text-slate-700 hover:text-indigo-600">
                          {i.company.name}
                        </Link>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          {i.contact && <span>{fullName(i.contact)}</span>}
                          {phone && (
                            <a href={`tel:${phone}`} className="hover:text-indigo-600" title={phone}>
                              <Phone className="h-3 w-3" />
                            </a>
                          )}
                          {email && (
                            <a href={`mailto:${email}`} className="hover:text-indigo-600" title={email}>
                              <Mail className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <div className="text-slate-600">{formatDate(i.dueDate)}</div>
                        {i.daysLate > 0 ? <Badge tone={i.daysLate > 60 ? 'red' : 'amber'}>{i.daysLate} {t("j de retard")}</Badge> : <span className="text-xs text-slate-400">{t("non échue")}</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-semibold tabular-nums text-slate-900">{money(i.remaining)}</div>
                        {Number(i.amountPaid) > 0 && <div className="text-xs text-slate-400">{t("sur")} {money(i.total)}</div>}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-slate-500 lg:table-cell">
                        {i.reminderCount > 0 ? (
                          <>
                            {i.reminderCount} {t("relance(s)")}
                            <div>{t("dernière :")} {formatDate(i.lastReminderAt)}</div>
                          </>
                        ) : (
                          t('Aucune')
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="secondary" onClick={() => remind.mutate(i.id)} loading={remind.isPending && remind.variables === i.id}>
                          <BellRing className="h-3.5 w-3.5" /> {t("Relancer")}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
