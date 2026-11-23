import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, toQuery } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, fullName, isOverdue, useMoney } from '../lib/format';
import { DOC_STATUSES } from '../lib/labels';
import type { DocumentSummary, DocumentType, Paginated } from '../types';
import { Badge, Button, Card, EmptyState, ErrorBox, PageHeader, Pagination, SearchInput, Select, Spinner, useDebounce } from '../components/ui';
import { ExportButton } from '../components/CsvImport';

import { t } from '../lib/i18n';
/** Badges de statut d'un document (gère avoirs, paiements partiels, retards). */
export function DocumentStatusBadges({ d }: { d: DocumentSummary }) {
  if (d.type === 'CREDIT_NOTE') return <Badge tone="violet">{t("Avoir émis")}</Badge>;
  const paid = Number(d.amountPaid);
  const late = d.type === 'INVOICE' && d.status === 'SENT' && isOverdue(d.dueDate);
  return (
    <div className="flex flex-wrap gap-1">
      {d.type === 'INVOICE' && d.status === 'SENT' && paid > 0 ? (
        <Badge tone="cyan">{t("Partiellement payée")}</Badge>
      ) : (
        <Badge tone={DOC_STATUSES[d.status].tone}>{d.type === 'INVOICE' && d.status === 'SENT' ? t('Émise') : DOC_STATUSES[d.status].label}</Badge>
      )}
      {late && <Badge tone="red">{t("En retard")}</Badge>}
      {d.reminderCount > 0 && d.status === 'SENT' && <Badge tone="amber">{d.reminderCount} {t("relance(s)")}</Badge>}
    </div>
  );
}

export default function DocumentsPage({ type }: { type: DocumentType }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const money = useMoney();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounce(q);
  const isInvoice = type === 'INVOICE';
  const statuses = isInvoice ? (['DRAFT', 'SENT', 'PAID', 'CANCELLED'] as const) : (['DRAFT', 'SENT', 'ACCEPTED', 'REFUSED', 'CANCELLED'] as const);
  // La page Factures affiche aussi les avoirs (sauf filtre de statut)
  const types = isInvoice && !status ? 'INVOICE,CREDIT_NOTE' : type;

  const { data, isLoading, error } = useQuery({
    queryKey: ['documents', types, search, status, page],
    queryFn: () => api<Paginated<DocumentSummary>>(`/documents${toQuery({ type: types, q: search, status, page })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title={isInvoice ? t('Factures & avoirs') : t('Devis')}
        subtitle={data ? t('{n} document(s)', { n: data.total }) : undefined}
        actions={
          <>
            {isInvoice && <ExportButton entity="invoices" />}
            {can(isInvoice ? 'invoices.create' : 'quotes.create') && (
              <Button onClick={() => navigate(`/documents/new/${type}`)}>
                <Plus className="h-4 w-4" /> {isInvoice ? t('Nouvelle facture') : t('Nouveau devis')}
              </Button>
            )}
          </>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <SearchInput value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder={t("Numéro ou client…")} />
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="sm:w-52">
            <option value="">{t("Tous les statuts")}</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {isInvoice && s === 'SENT' ? t('Émise (à encaisser)') : DOC_STATUSES[s].label}
              </option>
            ))}
            {isInvoice && <option value="OVERDUE">{t("En retard de paiement")}</option>}
          </Select>
        </div>
        <ErrorBox error={error} />
        {isLoading ? (
          <Spinner />
        ) : !data?.items.length ? (
          <EmptyState title={t("Aucun document")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">{t("Numéro")}</th>
                  <th className="px-4 py-2.5">{t("Client")}</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">{t("Date")}</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">{isInvoice ? t('Échéance') : t('Validité')}</th>
                  <th className="px-4 py-2.5 text-right">{t("Total TTC")}</th>
                  {isInvoice && <th className="hidden px-4 py-2.5 text-right lg:table-cell">{t("Reste dû")}</th>}
                  <th className="px-4 py-2.5">{t("Statut")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((d) => {
                  const late = d.type === 'INVOICE' && d.status === 'SENT' && isOverdue(d.dueDate);
                  const remaining = d.type === 'INVOICE' && d.status === 'SENT' ? Number(d.total) - Number(d.amountPaid) : 0;
                  const credit = d.type === 'CREDIT_NOTE';
                  return (
                    <tr key={d.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/documents/${d.id}`)}>
                      <td className="px-4 py-3">
                        <Link to={`/documents/${d.id}`} className="font-medium text-slate-900 hover:text-indigo-600" onClick={(e) => e.stopPropagation()}>
                          {d.number.startsWith('BROUILLON-') ? t('Brouillon') : d.number}
                        </Link>
                        {credit && <div className="text-xs text-violet-600">{t("Avoir")}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {d.company?.name}
                        {d.contact && <div className="text-xs text-slate-400">{fullName(d.contact)}</div>}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{formatDate(d.issueDate)}</td>
                      <td className={`hidden px-4 py-3 md:table-cell ${late ? 'font-medium text-red-600' : 'text-slate-600'}`}>{credit ? '—' : formatDate(d.dueDate)}</td>
                      <td className={`px-4 py-3 text-right font-medium tabular-nums ${credit ? 'text-violet-700' : 'text-slate-800'}`}>
                        {credit ? '−' : ''}
                        {money(d.total)}
                      </td>
                      {isInvoice && <td className="hidden px-4 py-3 text-right tabular-nums text-slate-600 lg:table-cell">{remaining > 0 ? money(remaining) : '—'}</td>}
                      <td className="px-4 py-3">
                        <DocumentStatusBadges d={d} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
