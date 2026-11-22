import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ACTIVITY_TYPES, COMPANY_SIZES, CONTACT_STATUSES, STAGES } from '../lib/labels';
import { fromDateTimeInput, fullName, toDateInput, toDateTimeInput } from '../lib/format';
import type { Activity, ActivityType, Company, Contact, ContactStatus, Deal, DealStage } from '../types';
import { ErrorBox, FormActions, Input, Modal, Select, Textarea } from './ui';
import { EntityPicker, UserSelect } from './pickers';

/** Mutation qui rafraîchit toutes les données après succès (simple et toujours cohérent). */
function useSave<T>(path: string, id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api<T>(id ? `${path}/${id}` : path, id ? 'PATCH' : 'POST', body),
    onSuccess: () => qc.invalidateQueries(),
  });
}

type Setter<T> = <K extends keyof T>(k: K) => (e: { target: { value: string } }) => void;
function useFormState<T extends object>(init: T): [T, Setter<T>, (patch: Partial<T>) => void] {
  const [f, setF] = useState(init);
  const set: Setter<T> = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  const patch = (p: Partial<T>) => setF((prev) => ({ ...prev, ...p }));
  return [f, set, patch];
}

/* ---------------- Entreprise ---------------- */
export function CompanyForm({ open, onClose, company, onSaved }: { open: boolean; onClose: () => void; company?: Company; onSaved?: (c: Company) => void }) {
  const { user } = useAuth();
  const [f, set, patch] = useFormState({
    name: company?.name ?? '',
    taxId: company?.taxId ?? '',
    industry: company?.industry ?? '',
    size: company?.size ?? '',
    email: company?.email ?? '',
    phone: company?.phone ?? '',
    website: company?.website ?? '',
    address: company?.address ?? '',
    city: company?.city ?? '',
    country: company?.country ?? '',
    notes: company?.notes ?? '',
    ownerId: company ? company.ownerId : user?.id ?? null,
  });
  const save = useSave<Company>('/companies', company?.id);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(f, { onSuccess: (c) => (onSaved?.(c), onClose()) });
  };
  return (
    <Modal open={open} onClose={onClose} title={company ? 'Modifier l’entreprise' : 'Nouvelle entreprise'} wide>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={save.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Raison sociale *" value={f.name} onChange={set('name')} required autoFocus className="sm:col-span-2" />
          <Input label="Secteur d’activité" value={f.industry} onChange={set('industry')} />
          <Select label="Effectif" value={f.size} onChange={set('size')}>
            <option value="">—</option>
            {COMPANY_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} salariés
              </option>
            ))}
          </Select>
          <Input label="Identifiant fiscal (SIRET, NIF, ICE…)" value={f.taxId} onChange={set('taxId')} />
          <Input label="Site web" value={f.website} onChange={set('website')} />
          <Input label="Email" type="email" value={f.email} onChange={set('email')} />
          <Input label="Téléphone" value={f.phone} onChange={set('phone')} />
          <Input label="Adresse" value={f.address} onChange={set('address')} className="sm:col-span-2" />
          <Input label="Ville" value={f.city} onChange={set('city')} />
          <Input label="Pays" value={f.country} onChange={set('country')} />
          <UserSelect value={f.ownerId} onChange={(ownerId) => patch({ ownerId })} />
          <Textarea label="Notes" value={f.notes} onChange={set('notes')} className="sm:col-span-2" />
        </div>
        <FormActions onCancel={onClose} loading={save.isPending} />
      </form>
    </Modal>
  );
}

/* ---------------- Contact ---------------- */
export function ContactForm({
  open,
  onClose,
  contact,
  defaultCompany,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  contact?: Contact;
  defaultCompany?: { id: string; name: string };
  onSaved?: (c: Contact) => void;
}) {
  const { user } = useAuth();
  const company = contact?.company ?? defaultCompany;
  const [f, set, patch] = useFormState({
    firstName: contact?.firstName ?? '',
    lastName: contact?.lastName ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    position: contact?.position ?? '',
    status: (contact?.status ?? 'LEAD') as ContactStatus,
    source: contact?.source ?? '',
    notes: contact?.notes ?? '',
    companyId: company?.id ?? null,
    companyName: company?.name ?? null,
    ownerId: contact ? contact.ownerId : user?.id ?? null,
  });
  const save = useSave<Contact>('/contacts', contact?.id);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const { companyName: _ignored, ...body } = f;
    save.mutate(body, { onSuccess: (c) => (onSaved?.(c), onClose()) });
  };
  return (
    <Modal open={open} onClose={onClose} title={contact ? 'Modifier le contact' : 'Nouveau contact'} wide>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={save.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Prénom *" value={f.firstName} onChange={set('firstName')} required autoFocus />
          <Input label="Nom *" value={f.lastName} onChange={set('lastName')} required />
          <Input label="Email" type="email" value={f.email} onChange={set('email')} />
          <Input label="Téléphone" value={f.phone} onChange={set('phone')} />
          <EntityPicker kind="company" label="Entreprise" value={f.companyId} valueLabel={f.companyName} onChange={(companyId, companyName) => patch({ companyId, companyName })} />
          <Input label="Fonction" value={f.position} onChange={set('position')} />
          <Select label="Statut" value={f.status} onChange={set('status')}>
            {CONTACT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Input label="Source" value={f.source} onChange={set('source')} placeholder="Salon, site web, recommandation…" />
          <UserSelect value={f.ownerId} onChange={(ownerId) => patch({ ownerId })} />
          <Textarea label="Notes" value={f.notes} onChange={set('notes')} className="sm:col-span-2" />
        </div>
        <FormActions onCancel={onClose} loading={save.isPending} />
      </form>
    </Modal>
  );
}

/* ---------------- Opportunité ---------------- */
export function DealForm({
  open,
  onClose,
  deal,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  deal?: Deal;
  defaults?: { stage?: DealStage; company?: { id: string; name: string }; contact?: { id: string; firstName: string; lastName: string } };
}) {
  const { user } = useAuth();
  const company = deal?.company ?? defaults?.company;
  const contact = deal?.contact ?? defaults?.contact;
  const [f, set, patch] = useFormState({
    title: deal?.title ?? '',
    amount: deal ? String(Number(deal.amount)) : '',
    stage: (deal?.stage ?? defaults?.stage ?? 'NEW') as DealStage,
    probability: deal ? String(deal.probability) : '',
    expectedCloseDate: toDateInput(deal?.expectedCloseDate),
    notes: deal?.notes ?? '',
    companyId: company?.id ?? null,
    companyName: company?.name ?? null,
    contactId: contact?.id ?? null,
    contactName: contact ? fullName(contact) : null,
    ownerId: deal ? deal.ownerId : user?.id ?? null,
  });
  const save = useSave<Deal>('/deals', deal?.id);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const { companyName: _c, contactName: _n, probability, amount, ...rest } = f;
    save.mutate(
      { ...rest, amount: amount === '' ? 0 : Number(amount), ...(probability === '' ? {} : { probability: Number(probability) }) },
      { onSuccess: () => onClose() },
    );
  };
  return (
    <Modal open={open} onClose={onClose} title={deal ? 'Modifier l’opportunité' : 'Nouvelle opportunité'} wide>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={save.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Intitulé *" value={f.title} onChange={set('title')} required autoFocus className="sm:col-span-2" />
          <Input label="Montant HT" type="number" min="0" step="0.01" value={f.amount} onChange={set('amount')} />
          <Select label="Étape" value={f.stage} onChange={(e) => patch({ stage: e.target.value as DealStage, probability: '' })}>
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Input label="Probabilité (%)" type="number" min="0" max="100" value={f.probability} onChange={set('probability')} placeholder="Auto selon l’étape" />
          <Input label="Clôture prévue" type="date" value={f.expectedCloseDate} onChange={set('expectedCloseDate')} />
          <EntityPicker
            kind="company"
            label="Entreprise"
            value={f.companyId}
            valueLabel={f.companyName}
            onChange={(companyId, companyName) => patch({ companyId, companyName })}
          />
          <EntityPicker
            kind="contact"
            label="Contact"
            value={f.contactId}
            valueLabel={f.contactName}
            companyId={f.companyId}
            onChange={(contactId, contactName) => patch({ contactId, contactName })}
          />
          <UserSelect value={f.ownerId} onChange={(ownerId) => patch({ ownerId })} />
          <Textarea label="Notes" value={f.notes} onChange={set('notes')} className="sm:col-span-2" />
        </div>
        {deal && (
          <div className="flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-sm">
            <Link to={`/documents/new/QUOTE?dealId=${deal.id}`} className="font-medium text-indigo-600 hover:underline">
              Créer un devis pour cette opportunité →
            </Link>
            {deal.company && (
              <Link to={`/companies/${deal.company.id}`} className="text-slate-500 hover:underline">
                Voir l’entreprise
              </Link>
            )}
          </div>
        )}
        <FormActions onCancel={onClose} loading={save.isPending} />
      </form>
    </Modal>
  );
}

/* ---------------- Activité ---------------- */
export interface ActivityDefaults {
  type?: ActivityType;
  company?: { id: string; name: string } | null;
  contact?: { id: string; firstName: string; lastName: string } | null;
  deal?: { id: string; title: string } | null;
}

export function ActivityForm({ open, onClose, activity, defaults }: { open: boolean; onClose: () => void; activity?: Activity; defaults?: ActivityDefaults }) {
  const { user } = useAuth();
  const company = activity?.company ?? defaults?.company;
  const contact = activity?.contact ?? defaults?.contact;
  const deal = activity?.deal ?? defaults?.deal;
  const [f, set, patch] = useFormState({
    type: (activity?.type ?? defaults?.type ?? 'CALL') as ActivityType,
    subject: activity?.subject ?? '',
    description: activity?.description ?? '',
    dueDate: toDateTimeInput(activity?.dueDate),
    companyId: company?.id ?? null,
    companyName: company?.name ?? null,
    contactId: contact?.id ?? null,
    contactName: contact ? fullName(contact) : null,
    dealId: deal?.id ?? null,
    dealName: deal?.title ?? null,
    assigneeId: activity ? activity.assigneeId : user?.id ?? null,
  });
  const save = useSave<Activity>('/activities', activity?.id);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const { companyName: _a, contactName: _b, dealName: _c, dueDate, ...rest } = f;
    save.mutate({ ...rest, dueDate: fromDateTimeInput(dueDate) }, { onSuccess: () => onClose() });
  };
  return (
    <Modal open={open} onClose={onClose} title={activity ? 'Modifier l’activité' : 'Nouvelle activité'} wide>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={save.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Type" value={f.type} onChange={set('type')}>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <Input label="Échéance" type="datetime-local" value={f.dueDate} onChange={set('dueDate')} />
          <Input label="Objet *" value={f.subject} onChange={set('subject')} required autoFocus className="sm:col-span-2" />
          <Textarea label="Description / compte rendu" value={f.description} onChange={set('description')} className="sm:col-span-2" />
          <EntityPicker kind="company" label="Entreprise" value={f.companyId} valueLabel={f.companyName} onChange={(companyId, companyName) => patch({ companyId, companyName })} />
          <EntityPicker
            kind="contact"
            label="Contact"
            value={f.contactId}
            valueLabel={f.contactName}
            companyId={f.companyId}
            onChange={(contactId, contactName) => patch({ contactId, contactName })}
          />
          <EntityPicker kind="deal" label="Opportunité" value={f.dealId} valueLabel={f.dealName} companyId={f.companyId} onChange={(dealId, dealName) => patch({ dealId, dealName })} />
          <UserSelect label="Assigné à" value={f.assigneeId} onChange={(assigneeId) => patch({ assigneeId })} />
        </div>
        <FormActions onCancel={onClose} loading={save.isPending} />
      </form>
    </Modal>
  );
}
