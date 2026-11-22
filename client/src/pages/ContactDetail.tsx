import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, Phone, Plus, Trash2, User } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate, fullName } from '../lib/format';
import { useTrackRecent } from '../lib/recent';
import { CONTACT_STATUSES, label, tone } from '../lib/labels';
import type { Contact, ContactStatus } from '../types';
import { Badge, Button, Card, ErrorBox, Spinner } from '../components/ui';
import { DealForm } from '../components/forms';
import { confirmDialog, toast } from '../components/feedback';
import { DealRows, DocumentRows } from '../components/RelatedLists';
import { ActivityComposer, InlineField, RecordHeader, StagePath, Tabs, Timeline, useFieldSaver, type PathStep } from '../components/record';
import { Owner } from '../components/OwnerCell';
import { EntityPicker, useUsers } from '../components/pickers';

import { t } from '../lib/i18n';
const CONTACT_PATH: PathStep[] = [
  { value: 'LEAD', label: t('Piste'), guidance: [t('Vérifier les coordonnées et l’entreprise.'), t('Premier contact : appel ou email de présentation.')] },
  { value: 'PROSPECT', label: t('Prospect'), guidance: [t('Identifier le besoin et créer une opportunité.'), t('Planifier un rendez-vous de découverte.')] },
  { value: 'CUSTOMER', label: t('Client'), guidance: [t('Suivre la satisfaction après la livraison.'), t('Repérer de nouvelles ventes : renouvellement, services complémentaires.')] },
];

export default function ContactDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: users } = useUsers();
  const [tab, setTab] = useState<'activity' | 'details'>('activity');
  const [newDeal, setNewDeal] = useState(false);
  const save = useFieldSaver(`/contacts/${id}`);

  const { data: c, isLoading, error } = useQuery({ queryKey: ['contact', id], queryFn: () => api<Contact>(`/contacts/${id}`) });
  useTrackRecent(c ? { kind: 'contact', id: c.id, title: fullName(c), sub: c.company?.name, to: `/contacts/${c.id}` } : null);

  const setStatus = useMutation({
    mutationFn: (status: ContactStatus) => api<Contact>(`/contacts/${id}`, 'PATCH', { status }),
    onSuccess: (ct) => {
      qc.invalidateQueries();
      toast.success(t('{name} est maintenant « {status} »', { name: fullName(ct), status: label(CONTACT_STATUSES, ct.status) }));
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => api(`/contacts/${id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(t('Contact supprimé'));
      navigate('/contacts');
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <Spinner />;
  if (error || !c) return <ErrorBox error={error} />;
  const contactRef = { id: c.id, firstName: c.firstName, lastName: c.lastName };
  const companyRef = c.company ?? undefined;

  return (
    <>
      <Link to="/contacts" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> {t("Contacts")}
      </Link>

      <RecordHeader
        icon={User}
        typeLabel={t("Contact")}
        title={fullName(c)}
        badges={<Badge tone={tone(CONTACT_STATUSES, c.status)}>{label(CONTACT_STATUSES, c.status)}</Badge>}
        actions={
          <>
            {c.phone && (
              <a href={`tel:${c.phone}`}>
                <Button variant="secondary">
                  <Phone className="h-4 w-4" /> {t("Appeler")}
                </Button>
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`}>
                <Button variant="secondary">
                  <Mail className="h-4 w-4" /> {t("Email")}
                </Button>
              </a>
            )}
            <Button onClick={() => setNewDeal(true)}>
              <Plus className="h-4 w-4" /> {t("Opportunité")}
            </Button>
            <Button
              variant="danger"
              aria-label={t("Supprimer le contact")}
              loading={remove.isPending}
              onClick={async () => (await confirmDialog({ title: t('Supprimer {name} ?', { name: fullName(c) }), message: t('Ses activités seront également supprimées.'), confirmLabel: t('Supprimer'), danger: true })) && remove.mutate()}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        }
        highlights={[
          { label: t('Fonction'), value: c.position },
          {
            label: t('Entreprise'),
            value: c.company && (
              <Link to={`/companies/${c.company.id}`} className="text-indigo-600 hover:underline">
                {c.company.name}
              </Link>
            ),
          },
          { label: t('Email'), value: c.email && <a href={`mailto:${c.email}`} className="text-indigo-600 hover:underline">{c.email}</a> },
          { label: t('Téléphone'), value: c.phone && <a href={`tel:${c.phone}`} className="text-indigo-600 hover:underline">{c.phone}</a> },
          { label: t('Source'), value: c.source },
          { label: t('Responsable'), value: <Owner owner={c.owner} /> },
        ]}
      />

      <StagePath
        steps={CONTACT_PATH}
        current={c.status}
        final={c.status === 'INACTIVE' ? { label: t('Inactif'), tone: 'lost' } : undefined}
        onChange={(s) => setStatus.mutate(s as ContactStatus)}
        onReopen={() => setStatus.mutate('LEAD')}
        pending={setStatus.isPending}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'activity', label: t('Activité'), count: c.activities?.length ?? 0 },
              { value: 'details', label: t('Détails') },
            ]}
          />
          {tab === 'activity' ? (
            <>
              <ActivityComposer links={{ contactId: c.id, companyId: c.companyId }} />
              <Timeline activities={c.activities ?? []} />
            </>
          ) : (
            <dl className="grid gap-x-8 px-4 py-2 sm:grid-cols-2">
              <InlineField label={t("Prénom")} value={c.firstName} onSave={save('firstName', (v) => v)} />
              <InlineField label={t("Nom")} value={c.lastName} onSave={save('lastName', (v) => v)} />
              <InlineField label={t("Email")} type="email" value={c.email} onSave={save('email')} />
              <InlineField label={t("Téléphone")} type="tel" value={c.phone} onSave={save('phone')} />
              <InlineField label={t("Fonction")} value={c.position} onSave={save('position')} />
              <div className="border-b border-slate-100 py-2 [&_label]:font-normal [&_label]:text-slate-500">
                <EntityPicker
                  kind="company"
                  label={t("Entreprise")}
                  value={c.companyId}
                  valueLabel={c.company?.name}
                  onChange={async (companyId) => {
                    try {
                      await save('companyId')(companyId ?? '');
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : t('Erreur'));
                    }
                  }}
                />
              </div>
              <InlineField
                label={t("Statut")}
                type="select"
                value={c.status}
                display={label(CONTACT_STATUSES, c.status)}
                options={CONTACT_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                onSave={save('status', (v) => v)}
              />
              <InlineField label={t("Source")} value={c.source} onSave={save('source')} />
              <InlineField
                label={t("Responsable")}
                type="select"
                value={c.ownerId ?? ''}
                display={<Owner owner={c.owner} />}
                options={[{ value: '', label: t('— Non attribué —') }, ...(users ?? []).filter((u) => u.active).map((u) => ({ value: u.id, label: u.name }))]}
                onSave={save('ownerId')}
              />
              <InlineField label={t("Créé le")} value={formatDate(c.createdAt)} readOnly />
              <InlineField label={t("Notes")} type="textarea" value={c.notes} onSave={save('notes')} className="sm:col-span-2" />
            </dl>
          )}
        </section>

        <div className="space-y-6">
          <Card
            title={t('Opportunités ({n})', { n: c.deals?.length ?? 0 })}
            actions={
              <Button size="sm" variant="ghost" onClick={() => setNewDeal(true)}>
                <Plus className="h-4 w-4" /> {t("Ajouter")}
              </Button>
            }
          >
            <DealRows deals={c.deals ?? []} />
          </Card>
          <Card title={t('Devis & factures ({n})', { n: c.documents?.length ?? 0 })}>
            <DocumentRows documents={c.documents ?? []} />
          </Card>
        </div>
      </div>

      {newDeal && <DealForm open defaults={{ company: companyRef, contact: contactRef }} onClose={() => setNewDeal(false)} />}
    </>
  );
}
