import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BellRing, CheckCircle2, FileMinus, FileOutput, Pencil, Printer, Send, Trash2, Wallet, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate, fullName, isOverdue, toDateInput, useMoney, useSettings } from '../lib/format';
import { DOC_STATUSES, DOC_TYPES, PAYMENT_METHODS, label } from '../lib/labels';
import type { DocumentFull, DocumentStatus, PaymentMethod } from '../types';
import { Badge, Button, Card, ErrorBox, FormActions, Input, Modal, Select, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';
import { confirmDialog, toast } from '../components/feedback';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function PaymentModal({ doc, remaining, onClose }: { doc: DocumentFull; remaining: number; onClose: () => void }) {
  const qc = useQueryClient();
  const money = useMoney();
  const [amount, setAmount] = useState(String(remaining));
  const [date, setDate] = useState(toDateInput(new Date()));
  const [method, setMethod] = useState<PaymentMethod>('TRANSFER');
  const [reference, setReference] = useState('');
  const save = useMutation({
    mutationFn: () => api<DocumentFull>(`/documents/${doc.id}/payments`, 'POST', { amount: Number(amount), date, method, reference }),
    onSuccess: (d) => {
      qc.invalidateQueries();
      toast.success(d.status === 'PAID' ? `Paiement enregistré : facture ${d.number} soldée` : `Paiement de ${money(Number(amount))} enregistré`);
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Modal open onClose={onClose} title={`Paiement – facture ${doc.number}`}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={save.error} />
        <p className="text-sm text-slate-600">
          Reste à payer : <span className="font-semibold text-slate-900">{money(remaining)}</span>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Montant encaissé *" type="number" step="0.01" min="0.01" max={remaining} value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <Select label="Mode de paiement" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          <Input label="Référence" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N° chèque, libellé virement…" />
        </div>
        <FormActions onCancel={onClose} loading={save.isPending} submitLabel="Enregistrer le paiement" />
      </form>
    </Modal>
  );
}

export default function DocumentViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const money = useMoney();
  const { user } = useAuth();
  const { data: org } = useSettings();
  const [paying, setPaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { data: doc, isLoading, error } = useQuery({ queryKey: ['document', id], queryFn: () => api<DocumentFull>(`/documents/${id}`) });

  const onDone = () => qc.invalidateQueries();
  const STATUS_TOAST: Partial<Record<DocumentStatus, string>> = { SENT: 'Document émis', PAID: 'Facture soldée', REFUSED: 'Devis marqué refusé', CANCELLED: 'Devis annulé' };
  const setStatus = useMutation({
    mutationFn: (status: DocumentStatus) => api<DocumentFull>(`/documents/${id}`, 'PATCH', { status }),
    onSuccess: (d, status) => {
      onDone();
      if (STATUS_TOAST[status]) toast.success(status === 'SENT' && d.type === 'INVOICE' ? `Facture ${d.number} émise` : STATUS_TOAST[status]!);
    },
  });
  const convert = useMutation({
    mutationFn: () => api<DocumentFull>(`/documents/${id}/convert`, 'POST'),
    onSuccess: (inv) => {
      onDone();
      navigate(`/documents/${inv.id}`);
    },
  });
  const creditNote = useMutation({
    mutationFn: () => api<DocumentFull>(`/documents/${id}/credit-note`, 'POST'),
    onSuccess: (cn) => {
      onDone();
      navigate(`/documents/${cn.id}`);
    },
  });
  const remind = useMutation({
    mutationFn: () => api<{ reminderCount: number; email: { to: string; subject: string; body: string } }>(`/documents/${id}/reminders`, 'POST'),
    onSuccess: ({ reminderCount, email }) => {
      onDone();
      setNotice(`Relance n°${reminderCount} enregistrée dans l’historique du client. Votre messagerie s’ouvre avec un email prérempli.`);
      window.location.href = `mailto:${encodeURIComponent(email.to)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
    },
  });
  const deletePayment = useMutation({ mutationFn: (pid: string) => api(`/documents/${id}/payments/${pid}`, 'DELETE'), onSuccess: onDone });
  const remove = useMutation({
    mutationFn: () => api(`/documents/${id}`, 'DELETE'),
    onSuccess: () => {
      onDone();
      navigate(doc?.type === 'QUOTE' ? '/documents/quotes' : '/documents/invoices');
    },
  });

  if (isLoading) return <Spinner />;
  if (error || !doc) return <ErrorBox error={error} />;

  const t = DOC_TYPES[doc.type];
  const isInvoice = doc.type === 'INVOICE';
  const isCredit = doc.type === 'CREDIT_NOTE';
  const paid = Number(doc.amountPaid);
  const remaining = round2(Number(doc.total) - paid);
  const late = isInvoice && doc.status === 'SENT' && isOverdue(doc.dueDate);
  const isDraftNumber = doc.number.startsWith('BROUILLON-');
  const hasInvoice = doc.derived.some((d) => d.type === 'INVOICE');
  const hasCredit = doc.derived.some((d) => d.type === 'CREDIT_NOTE');
  const taxByRate = doc.lines.reduce<Record<string, number>>((acc, l) => {
    const ht = Number(l.quantity) * Number(l.unitPrice);
    const rate = String(Number(l.taxRate));
    acc[rate] = (acc[rate] ?? 0) + (ht * Number(l.taxRate)) / 100;
    return acc;
  }, {});
  const busy = setStatus.isPending || convert.isPending || remove.isPending || creditNote.isPending || remind.isPending;
  const confirmStatus = async (s: DocumentStatus, title: string, message?: string, danger = false) =>
    (await confirmDialog({ title, message, danger, confirmLabel: danger ? 'Confirmer l’annulation' : 'Confirmer' })) && setStatus.mutate(s);
  const statusBadge = isCredit ? (
    <Badge tone="violet">Émis</Badge>
  ) : isInvoice && doc.status === 'SENT' && paid > 0 ? (
    <Badge tone="cyan">Partiellement payée</Badge>
  ) : (
    <Badge tone={DOC_STATUSES[doc.status].tone}>{isInvoice && doc.status === 'SENT' ? 'Émise' : DOC_STATUSES[doc.status].label}</Badge>
  );

  return (
    <>
      <div className="no-print">
        <Link to={doc.type === 'QUOTE' ? '/documents/quotes' : '/documents/invoices'} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> {doc.type === 'QUOTE' ? 'Devis' : 'Factures & avoirs'}
        </Link>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">
              {t.label} {isDraftNumber ? '(brouillon)' : doc.number}
            </h1>
            {statusBadge}
            {late && <Badge tone="red">En retard</Badge>}
            {doc.reminderCount > 0 && doc.status === 'SENT' && (
              <Badge tone="amber">
                {doc.reminderCount} relance(s) · dernière le {formatDate(doc.lastReminderAt)}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {doc.status === 'DRAFT' && (
              <>
                <Link to={`/documents/${doc.id}/edit`}>
                  <Button variant="secondary">
                    <Pencil className="h-4 w-4" /> Modifier
                  </Button>
                </Link>
                <Button
                  onClick={() =>
                    isInvoice
                      ? confirmStatus('SENT', 'Émettre la facture ?', 'Un numéro définitif et séquentiel sera attribué. La facture ne sera plus modifiable.')
                      : confirmStatus('SENT', 'Marquer le devis comme envoyé ?', 'Il ne sera plus modifiable.')
                  }
                  loading={setStatus.isPending}
                >
                  <Send className="h-4 w-4" /> {isInvoice ? 'Émettre' : 'Marquer envoyé'}
                </Button>
              </>
            )}
            {doc.type === 'QUOTE' && (doc.status === 'SENT' || doc.status === 'ACCEPTED') && !hasInvoice && (
              <Button
                onClick={async () =>
                  (await confirmDialog({ title: 'Transformer en facture ?', message: 'Une facture brouillon est créée avec les mêmes lignes. Le devis passe « accepté » et l’opportunité liée « gagnée ».', confirmLabel: 'Créer la facture' })) &&
                  convert.mutate()
                }
                loading={convert.isPending}
              >
                <FileOutput className="h-4 w-4" /> Transformer en facture
              </Button>
            )}
            {doc.type === 'QUOTE' && doc.status === 'SENT' && (
              <Button variant="secondary" onClick={() => setStatus.mutate('REFUSED')} disabled={busy}>
                <XCircle className="h-4 w-4" /> Refusé
              </Button>
            )}
            {isInvoice && doc.status === 'SENT' && (
              <>
                <Button onClick={() => setPaying(true)} disabled={busy}>
                  <Wallet className="h-4 w-4" /> Enregistrer un paiement
                </Button>
                <Button variant="secondary" onClick={() => confirmStatus('PAID', 'Marquer la facture comme soldée ?', `Un paiement de ${money(remaining)} (reste dû) sera enregistré à la date du jour.`)} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4" /> Soldée
                </Button>
                <Button variant="secondary" onClick={() => remind.mutate()} loading={remind.isPending} disabled={busy}>
                  <BellRing className="h-4 w-4" /> Relancer
                </Button>
              </>
            )}
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimer / PDF
            </Button>
            {isInvoice && (doc.status === 'SENT' || doc.status === 'PAID') && !hasCredit && (
              <Button
                variant="danger"
                onClick={async () =>
                  (await confirmDialog({
                    title: `Annuler ${doc.number} par un avoir ?`,
                    message: `Un avoir de ${money(doc.total)} est émis immédiatement et la facture passe « annulée ». Cette opération est définitive.${paid > 0 ? `\n\nAttention : ${money(paid)} déjà encaissé devra être remboursé au client.` : ''}`,
                    confirmLabel: 'Émettre l’avoir',
                    danger: true,
                  })) && creditNote.mutate()
                }
                disabled={busy}
              >
                <FileMinus className="h-4 w-4" /> Créer un avoir
              </Button>
            )}
            {doc.status === 'DRAFT' ? (
              <Button
                variant="danger"
                onClick={async () => (await confirmDialog({ title: 'Supprimer ce brouillon ?', confirmLabel: 'Supprimer', danger: true })) && remove.mutate()}
                disabled={busy}
                aria-label="Supprimer le brouillon"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : (
              doc.type === 'QUOTE' &&
              doc.status !== 'CANCELLED' && (
                <Button variant="danger" onClick={() => confirmStatus('CANCELLED', 'Annuler ce devis ?', 'Cette action est définitive.', true)} disabled={busy}>
                  Annuler le devis
                </Button>
              )
            )}
          </div>
        </div>
        <div className="mb-4 space-y-2">
          <ErrorBox error={setStatus.error || convert.error || remove.error || creditNote.error || remind.error || deletePayment.error} />
          {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}
          {(doc.source || doc.derived.length > 0 || doc.deal) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
              {doc.source && (
                <span>
                  {isCredit ? 'Annule la facture' : 'Issu du devis'}{' '}
                  <Link to={`/documents/${doc.source.id}`} className="text-indigo-600 hover:underline">
                    {doc.source.number}
                  </Link>
                </span>
              )}
              {doc.derived.map((d) => (
                <span key={d.id}>
                  {DOC_TYPES[d.type].label} :{' '}
                  <Link to={`/documents/${d.id}`} className="text-indigo-600 hover:underline">
                    {d.number.startsWith('BROUILLON-') ? 'brouillon' : d.number}
                  </Link>
                </span>
              ))}
              {doc.deal && <span>Opportunité : {doc.deal.title}</span>}
            </div>
          )}
        </div>

        {isInvoice && doc.status !== 'DRAFT' && (
          <Card
            title={`Paiements (${doc.payments.length})`}
            className="mx-auto mb-6 max-w-4xl"
            actions={
              <span className="text-sm text-slate-600">
                Encaissé <span className="font-semibold tabular-nums text-slate-900">{money(paid)}</span> · Reste{' '}
                <span className={`font-semibold tabular-nums ${remaining > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{money(Math.max(0, remaining))}</span>
              </span>
            }
          >
            <div className="h-1.5 bg-slate-100">
              <div className="h-1.5 bg-emerald-500" style={{ width: `${Math.min(100, (paid / Math.max(Number(doc.total), 0.01)) * 100)}%` }} />
            </div>
            {doc.payments.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-500">Aucun paiement enregistré.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {doc.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium tabular-nums text-slate-800">{money(p.amount)}</span>
                      <span className="text-slate-500">
                        {' '}
                        · {formatDate(p.date)} · {label(PAYMENT_METHODS, p.method)}
                        {p.reference && ` · ${p.reference}`}
                        {p.notes && ` · ${p.notes}`}
                      </span>
                    </div>
                    {doc.status !== 'CANCELLED' && (user?.role === 'ADMIN' || p.createdById === user?.id) && (
                      <button
                        onClick={async () =>
                          (await confirmDialog({ title: `Supprimer ce paiement de ${money(p.amount)} ?`, message: 'Le reste à payer de la facture sera recalculé.', confirmLabel: 'Supprimer', danger: true })) &&
                          deletePayment.mutate(p.id)
                        }
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="Supprimer le paiement"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      {/* Document imprimable */}
      <article className="print-area mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <header className="flex flex-col justify-between gap-6 sm:flex-row">
          <div className="text-sm text-slate-600">
            <div className="text-lg font-semibold text-slate-900">
              {org?.name} {org?.legalForm && <span className="text-sm font-normal text-slate-500">{org.legalForm}</span>}
            </div>
            {org?.address && <div>{org.address}</div>}
            {(org?.city || org?.country) && <div>{[org?.city, org?.country].filter(Boolean).join(', ')}</div>}
            {org?.phone && <div>{org.phone}</div>}
            {org?.email && <div>{org.email}</div>}
            {org?.taxId && <div>Id. fiscal : {org.taxId}</div>}
            {org?.registryNumber && <div>RC / RCS : {org.registryNumber}</div>}
          </div>
          <div className="sm:text-right">
            <div className={`text-2xl font-bold uppercase tracking-wide ${isCredit ? 'text-violet-700' : 'text-indigo-700'}`}>{t.label}</div>
            <div className="mt-1 text-sm text-slate-700">N° {isDraftNumber ? 'BROUILLON' : doc.number}</div>
            <div className="text-sm text-slate-500">Date : {formatDate(doc.issueDate)}</div>
            {isCredit && doc.source && <div className="text-sm text-slate-500">Sur facture N° {doc.source.number}</div>}
            {doc.dueDate && !isCredit && (
              <div className="text-sm text-slate-500">
                {doc.type === 'QUOTE' ? 'Valable jusqu’au' : 'Échéance'} : {formatDate(doc.dueDate)}
              </div>
            )}
          </div>
        </header>

        <section className="mt-8 flex justify-end">
          <div className="w-full rounded-lg bg-slate-50 p-4 text-sm sm:w-80">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Client</div>
            <div className="mt-1 font-semibold text-slate-900">{doc.company.name}</div>
            {doc.contact && <div className="text-slate-600">À l’attention de {fullName(doc.contact)}</div>}
            {doc.company.address && <div className="text-slate-600">{doc.company.address}</div>}
            {(doc.company.city || doc.company.country) && <div className="text-slate-600">{[doc.company.city, doc.company.country].filter(Boolean).join(', ')}</div>}
            {doc.company.taxId && <div className="text-slate-600">Id. fiscal : {doc.company.taxId}</div>}
          </div>
        </section>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-800 text-left text-xs uppercase tracking-wide text-slate-600">
              <th className="py-2">Désignation</th>
              <th className="py-2 text-right">Qté</th>
              <th className="py-2 text-right">P.U. HT</th>
              <th className="hidden py-2 text-right sm:table-cell">TVA</th>
              <th className="py-2 text-right">Total HT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {doc.lines.map((l, i) => (
              <tr key={l.id ?? i}>
                <td className="py-2.5 pr-4 text-slate-800">{l.description}</td>
                <td className="py-2.5 text-right tabular-nums">{Number(l.quantity).toLocaleString('fr-FR')}</td>
                <td className="py-2.5 text-right tabular-nums">{money(l.unitPrice)}</td>
                <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{Number(l.taxRate)} %</td>
                <td className="py-2.5 text-right tabular-nums">{money(Number(l.quantity) * Number(l.unitPrice))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-6 flex justify-end">
          <dl className="w-full space-y-1 text-sm sm:w-72">
            <div className="flex justify-between">
              <dt className="text-slate-500">Total HT</dt>
              <dd className="tabular-nums">{money(doc.subtotal)}</dd>
            </div>
            {Object.entries(taxByRate).map(([rate, amount]) => (
              <div key={rate} className="flex justify-between">
                <dt className="text-slate-500">TVA {rate} %</dt>
                <dd className="tabular-nums">{money(amount)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t-2 border-slate-800 pt-2 text-base font-bold">
              <dt>{isCredit ? 'Montant de l’avoir TTC' : 'Total TTC'}</dt>
              <dd className="tabular-nums">{money(doc.total)}</dd>
            </div>
            {isInvoice && paid > 0 && doc.status !== 'CANCELLED' && (
              <>
                <div className="flex justify-between pt-1 text-slate-600">
                  <dt>Déjà réglé</dt>
                  <dd className="tabular-nums">− {money(paid)}</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>Reste à payer</dt>
                  <dd className="tabular-nums">{money(Math.max(0, remaining))}</dd>
                </div>
              </>
            )}
          </dl>
        </section>

        {doc.notes && <p className="mt-8 whitespace-pre-wrap text-sm text-slate-600">{doc.notes}</p>}
        {doc.type === 'QUOTE' && (
          <div className="mt-10 grid grid-cols-2 gap-8 text-sm text-slate-500">
            <div />
            <div className="h-24 rounded-lg border border-dashed border-slate-300 p-3">Bon pour accord — date et signature :</div>
          </div>
        )}
        <footer className="mt-10 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
          {isInvoice && org?.paymentTerms !== undefined && <div>Paiement à {org.paymentTerms} jours.</div>}
          {org?.bankDetails && <div className="whitespace-pre-wrap">{org.bankDetails}</div>}
          {org?.documentFooter && <div className="mt-1">{org.documentFooter}</div>}
        </footer>
      </article>

      {paying && <PaymentModal doc={doc} remaining={remaining} onClose={() => setPaying(false)} />}
    </>
  );
}
