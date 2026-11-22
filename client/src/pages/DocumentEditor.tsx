import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { fullName, toDateInput, useMoney, useSettings } from '../lib/format';
import { DOC_TYPES } from '../lib/labels';
import type { Company, Deal, DocumentFull, DocumentType } from '../types';
import { Button, Card, ErrorBox, Input, PageHeader, Spinner, Textarea } from '../components/ui';
import { EntityPicker } from '../components/pickers';
import { ProductPicker } from '../components/ProductPicker';
import { toast } from '../components/feedback';

import { t } from '../lib/i18n';
interface LineState {
  key: number;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
}

let lineKey = 0;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function DocumentEditorPage() {
  const { id, type: typeParam } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const money = useMoney();
  const { data: settings } = useSettings();
  const isEdit = Boolean(id);

  const existing = useQuery({ queryKey: ['document', id], queryFn: () => api<DocumentFull>(`/documents/${id}`), enabled: isEdit });
  const prefillCompanyId = search.get('companyId');
  const prefillDealId = search.get('dealId');
  const prefillCompany = useQuery({
    queryKey: ['company', prefillCompanyId],
    queryFn: () => api<Company>(`/companies/${prefillCompanyId}`),
    enabled: !isEdit && !!prefillCompanyId,
  });
  const prefillDeal = useQuery({ queryKey: ['deal', prefillDealId], queryFn: () => api<Deal>(`/deals/${prefillDealId}`), enabled: !isEdit && !!prefillDealId });

  const type = (existing.data?.type ?? typeParam ?? 'QUOTE') as DocumentType;
  const defaultTax = String(Number(settings?.defaultTaxRate ?? 20));

  const [company, setCompany] = useState<{ id: string | null; name: string | null }>({ id: null, name: null });
  const [contact, setContact] = useState<{ id: string | null; name: string | null }>({ id: null, name: null });
  const [deal, setDeal] = useState<{ id: string | null; name: string | null }>({ id: null, name: null });
  const [issueDate, setIssueDate] = useState(toDateInput(new Date()));
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineState[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Initialisation du formulaire (édition ou pré-remplissage)
  useEffect(() => {
    if (initialized) return;
    if (isEdit) {
      const d = existing.data;
      if (!d) return;
      setCompany({ id: d.company.id, name: d.company.name });
      setContact({ id: d.contactId, name: d.contact ? fullName(d.contact) : null });
      setDeal({ id: d.dealId, name: d.deal?.title ?? null });
      setIssueDate(toDateInput(d.issueDate));
      setDueDate(toDateInput(d.dueDate));
      setNotes(d.notes ?? '');
      setLines(d.lines.map((l) => ({ key: lineKey++, description: l.description, quantity: String(Number(l.quantity)), unitPrice: String(Number(l.unitPrice)), taxRate: String(Number(l.taxRate)) })));
      setInitialized(true);
      return;
    }
    if (!settings) return;
    if (prefillCompanyId && !prefillCompany.data) return;
    if (prefillDealId && !prefillDeal.data) return;
    const dl = prefillDeal.data;
    const co = prefillCompany.data ?? dl?.company;
    if (co) setCompany({ id: co.id, name: co.name });
    if (dl) {
      setDeal({ id: dl.id, name: dl.title });
      if (dl.contact) setContact({ id: dl.contact.id, name: fullName(dl.contact) });
    }
    setLines([{ key: lineKey++, description: dl?.title ?? '', quantity: '1', unitPrice: dl ? String(Number(dl.amount)) : '', taxRate: defaultTax }]);
    setInitialized(true);
  }, [initialized, isEdit, existing.data, settings, prefillCompanyId, prefillCompany.data, prefillDealId, prefillDeal.data, defaultTax]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const l of lines) {
      const ht = round2((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0));
      subtotal += ht;
      tax += round2((ht * (Number(l.taxRate) || 0)) / 100);
    }
    return { subtotal: round2(subtotal), tax: round2(tax), total: round2(subtotal + tax) };
  }, [lines]);

  const save = useMutation({
    mutationFn: (body: unknown) => (isEdit ? api<DocumentFull>(`/documents/${id}`, 'PATCH', body) : api<DocumentFull>('/documents', 'POST', body)),
    onSuccess: (doc) => {
      qc.invalidateQueries();
      toast.success(t('Brouillon enregistré'));
      navigate(`/documents/${doc.id}`, { replace: true });
    },
  });

  const updateLine = (key: number, patch: Partial<LineState>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!company.id) {
      toast.error(t('Veuillez choisir un client'));
      return;
    }
    save.mutate({
      ...(isEdit ? {} : { type }),
      companyId: company.id,
      contactId: contact.id,
      dealId: deal.id,
      issueDate: issueDate || null,
      dueDate: dueDate || null,
      notes,
      lines: lines.map(({ description, quantity, unitPrice, taxRate }) => ({
        description,
        quantity: Number(quantity) || 0,
        unitPrice: Number(unitPrice) || 0,
        taxRate: Number(taxRate) || 0,
      })),
    });
  };

  if ((isEdit && existing.isLoading) || !initialized) return <Spinner />;
  if (existing.data && existing.data.status !== 'DRAFT') {
    return <ErrorBox error={new Error(t('Ce document a été émis et ne peut plus être modifié.'))} />;
  }

  const title = isEdit
    ? t('Modifier {doc} {number}', { doc: DOC_TYPES[type].label.toLowerCase(), number: existing.data?.number })
    : type === 'QUOTE'
      ? t('Nouveau devis')
      : t('Nouvelle facture');

  return (
    <form onSubmit={submit}>
      <Link to={type === 'QUOTE' ? '/documents/quotes' : '/documents/invoices'} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> {DOC_TYPES[type].plural}
      </Link>
      <PageHeader
        title={title}
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              {t("Annuler")}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t("Enregistrer le brouillon")}
            </Button>
          </>
        }
      />
      <div className="mb-4">
        <ErrorBox error={save.error} />
      </div>

      <Card className="mb-6">
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <EntityPicker kind="company" label={t("Client")} required value={company.id} valueLabel={company.name} onChange={(id, name) => setCompany({ id, name })} />
          <EntityPicker kind="contact" label={t("Contact")} value={contact.id} valueLabel={contact.name} companyId={company.id} onChange={(id, name) => setContact({ id, name })} />
          <EntityPicker kind="deal" label={t("Opportunité liée")} value={deal.id} valueLabel={deal.name} companyId={company.id} onChange={(id, name) => setDeal({ id, name })} />
          <Input label={t("Date d’émission")} type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          <Input
            label={type === 'QUOTE' ? t('Valable jusqu’au') : t('Date d’échéance')}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            placeholder={t("Auto")}
          />
        </div>
        {type === 'INVOICE' && !isEdit && (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            {t("La facture reçoit un numéro provisoire ; son numéro définitif (séquentiel) est attribué lors de l’émission.")}
          </p>
        )}
      </Card>

      <Card title={t("Lignes")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">{t("Désignation")}</th>
                <th className="w-24 px-3 py-2">{t("Qté")}</th>
                <th className="w-32 px-3 py-2">{t("P.U. HT")}</th>
                <th className="w-24 px-3 py-2">{t("TVA %")}</th>
                <th className="w-32 px-3 py-2 text-right">{t("Total HT")}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.key}>
                  <td className="px-3 py-2">
                    <Input value={l.description} onChange={(e) => updateLine(l.key, { description: e.target.value })} required placeholder={t("Produit ou prestation")} />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" step="0.01" min="0" value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: e.target.value })} required />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" step="0.01" value={l.unitPrice} onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })} required />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" step="0.01" min="0" max="100" value={l.taxRate} onChange={(e) => updateLine(l.key, { taxRate: e.target.value })} required />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{money(round2((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)))}</td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      disabled={lines.length === 1}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      aria-label={t("Supprimer la ligne")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-4 border-t border-slate-100 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="button" variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, { key: lineKey++, description: '', quantity: '1', unitPrice: '', taxRate: defaultTax }])}>
              <Plus className="h-4 w-4" /> {t("Ajouter une ligne")}
            </Button>
            <ProductPicker
              onPick={(p) =>
                setLines((ls) => {
                  const line = { key: lineKey++, description: p.unit ? `${p.name} (${p.unit})` : p.name, quantity: '1', unitPrice: String(Number(p.unitPrice)), taxRate: String(Number(p.taxRate)) };
                  // Remplace la dernière ligne si elle est encore vide
                  const last = ls[ls.length - 1];
                  return last && !last.description.trim() && !last.unitPrice ? [...ls.slice(0, -1), line] : [...ls, line];
                })
              }
            />
          </div>
          <dl className="w-full space-y-1 text-sm sm:w-64">
            <div className="flex justify-between">
              <dt className="text-slate-500">{t("Total HT")}</dt>
              <dd className="tabular-nums">{money(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{t("TVA")}</dt>
              <dd className="tabular-nums">{money(totals.tax)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold">
              <dt>{t("Total TTC")}</dt>
              <dd className="tabular-nums">{money(totals.total)}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <Card className="mt-6">
        <div className="p-4">
          <Textarea label={t("Conditions / notes (imprimées sur le document)")} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Card>
    </form>
  );
}
