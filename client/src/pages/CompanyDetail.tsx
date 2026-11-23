import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, FilePlus, Globe, Phone, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, useMoney } from '../lib/format';
import { useTrackRecent } from '../lib/recent';
import { COMPANY_SIZES } from '../lib/labels';
import type { Company } from '../types';
import { Button, Card, ErrorBox, Spinner } from '../components/ui';
import { ContactForm, DealForm } from '../components/forms';
import { confirmDialog, toast } from '../components/feedback';
import { ContactRows, DealRows, DocumentRows } from '../components/RelatedLists';
import { ActivityComposer, InlineField, RecordHeader, Tabs, Timeline, useFieldSaver } from '../components/record';
import { Owner } from '../components/OwnerCell';
import { useUsers } from '../components/pickers';

import { t } from '../lib/i18n';
export default function CompanyDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const money = useMoney();
  const { data: users } = useUsers();
  const { user, can } = useAuth();
  const canEdit = can('companies.edit');
  const showActivity = can('activities.view');
  const [tab, setTab] = useState<'activity' | 'details'>(showActivity ? 'activity' : 'details');
  const [modal, setModal] = useState<'contact' | 'deal' | null>(null);
  const save = useFieldSaver(`/companies/${id}`, canEdit);

  const { data: c, isLoading, error } = useQuery({ queryKey: ['company', id], queryFn: () => api<Company>(`/companies/${id}`) });
  useTrackRecent(c ? { kind: 'company', id: c.id, title: c.name, sub: c.city ?? undefined, to: `/companies/${c.id}` } : null);

  const remove = useMutation({
    mutationFn: () => api(`/companies/${id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(t('Entreprise supprimée'));
      navigate('/companies');
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <Spinner />;
  if (error || !c) return <ErrorBox error={error} />;
  const ref = { id: c.id, name: c.name };
  const deals = c.deals ?? [];
  const openDeals = deals.filter((d) => d.stage !== 'WON' && d.stage !== 'LOST');
  const wonTotal = deals.filter((d) => d.stage === 'WON').reduce((s, d) => s + Number(d.amount), 0);
  const website = c.website && (c.website.startsWith('http') ? c.website : `https://${c.website}`);

  return (
    <>
      <Link to="/companies" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> {t("Entreprises")}
      </Link>

      <RecordHeader
        icon={Building2}
        typeLabel={t("Entreprise")}
        title={c.name}
        actions={
          <>
            {can('contacts.create') && (
              <Button variant="secondary" onClick={() => setModal('contact')}>
                <Plus className="h-4 w-4" /> {t("Contact")}
              </Button>
            )}
            {can('deals.create') && (
              <Button variant="secondary" onClick={() => setModal('deal')}>
                <Plus className="h-4 w-4" /> {t("Opportunité")}
              </Button>
            )}
            {can('quotes.create') && (
              <Link to={`/documents/new/QUOTE?companyId=${c.id}`}>
                <Button>
                  <FilePlus className="h-4 w-4" /> {t("Devis")}
                </Button>
              </Link>
            )}
            {can('companies.delete') && (
            <Button
              variant="danger"
              aria-label={t("Supprimer l’entreprise")}
              loading={remove.isPending}
              onClick={async () =>
                (await confirmDialog({
                  title: t('Supprimer « {name} » ?', { name: c.name }),
                  message: t('Les activités liées seront supprimées. Les contacts et opportunités sont conservés, sans entreprise.'),
                  confirmLabel: t('Supprimer'),
                  danger: true,
                })) && remove.mutate()
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            )}
          </>
        }
        highlights={[
          { label: t('Secteur'), value: c.industry },
          {
            label: t('Téléphone'),
            value: c.phone && (
              <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                <Phone className="h-3 w-3" /> {c.phone}
              </a>
            ),
          },
          {
            label: t('Site web'),
            value: website && (
              <a href={website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                <Globe className="h-3 w-3" /> {c.website}
              </a>
            ),
          },
          { label: t('Opportunités en cours'), value: `${openDeals.length} · ${money(openDeals.reduce((s, d) => s + Number(d.amount), 0), true)}` },
          { label: t('CA gagné'), value: money(wonTotal, true) },
          { label: t('Responsable'), value: <Owner owner={c.owner} /> },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              ...(showActivity ? [{ value: 'activity' as const, label: t('Activité'), count: c.activities?.length ?? 0 }] : []),
              { value: 'details', label: t('Détails') },
            ]}
          />
          {tab === 'activity' && showActivity ? (
            <>
              {can('activities.create') && <ActivityComposer links={{ companyId: c.id }} />}
              <Timeline activities={c.activities ?? []} />
            </>
          ) : (
            <dl className="grid gap-x-8 px-4 py-2 sm:grid-cols-2">
              <InlineField label={t("Raison sociale")} value={c.name} onSave={save('name', (v) => v)} />
              <InlineField label={t("Identifiant fiscal")} value={c.taxId} onSave={save('taxId')} />
              <InlineField label={t("Secteur d’activité")} value={c.industry} onSave={save('industry')} />
              <InlineField
                label={t("Effectif")}
                type="select"
                value={c.size ?? ''}
                display={c.size ? t('{n} salariés', { n: c.size }) : undefined}
                options={[{ value: '', label: '—' }, ...COMPANY_SIZES.map((s) => ({ value: s, label: t('{n} salariés', { n: s }) }))]}
                onSave={save('size')}
              />
              <InlineField label={t("Email")} type="email" value={c.email} onSave={save('email')} />
              <InlineField label={t("Téléphone")} type="tel" value={c.phone} onSave={save('phone')} />
              <InlineField label={t("Site web")} type="url" value={c.website} onSave={save('website')} />
              <InlineField
                label={t("Responsable")}
                type="select"
                value={c.ownerId ?? ''}
                display={<Owner owner={c.owner} />}
                options={[{ value: '', label: t('— Non attribué —') }, ...(users ?? []).filter((u) => u.active).map((u) => ({ value: u.id, label: u.name }))]}
                onSave={user?.scope === 'OWN' ? undefined : save('ownerId')}
              />
              <InlineField label={t("Adresse")} value={c.address} onSave={save('address')} className="sm:col-span-2" />
              <InlineField label={t("Ville")} value={c.city} onSave={save('city')} />
              <InlineField label={t("Pays")} value={c.country} onSave={save('country')} />
              <InlineField label={t("Notes")} type="textarea" value={c.notes} onSave={save('notes')} className="sm:col-span-2" />
              <InlineField label={t("Créée le")} value={formatDate(c.createdAt)} readOnly />
            </dl>
          )}
        </section>

        <div className="space-y-6">
          {can('contacts.view') && (
          <Card
            title={`Contacts (${c.contacts?.length ?? 0})`}
            actions={
              can('contacts.create') && <Button size="sm" variant="ghost" onClick={() => setModal('contact')}>
                <Plus className="h-4 w-4" /> {t("Ajouter")}
              </Button>
            }
          >
            <ContactRows contacts={c.contacts ?? []} />
          </Card>
          )}
          {can('deals.view') && (
          <Card
            title={t('Opportunités ({n})', { n: deals.length })}
            actions={
              can('deals.create') && <Button size="sm" variant="ghost" onClick={() => setModal('deal')}>
                <Plus className="h-4 w-4" /> {t("Ajouter")}
              </Button>
            }
          >
            <DealRows deals={deals} />
          </Card>
          )}
          {(can('quotes.view') || can('invoices.view')) && (
          <Card title={t('Devis & factures ({n})', { n: c.documents?.length ?? 0 })}>
            <DocumentRows documents={c.documents ?? []} />
          </Card>
          )}
        </div>
      </div>

      {modal === 'contact' && <ContactForm open defaultCompany={ref} onClose={() => setModal(null)} />}
      {modal === 'deal' && <DealForm open defaults={{ company: ref }} onClose={() => setModal(null)} />}
    </>
  );
}
