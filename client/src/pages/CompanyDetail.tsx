import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, FilePlus, Globe, Phone, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
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

export default function CompanyDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const money = useMoney();
  const { data: users } = useUsers();
  const [tab, setTab] = useState<'activity' | 'details'>('activity');
  const [modal, setModal] = useState<'contact' | 'deal' | null>(null);
  const save = useFieldSaver(`/companies/${id}`);

  const { data: c, isLoading, error } = useQuery({ queryKey: ['company', id], queryFn: () => api<Company>(`/companies/${id}`) });
  useTrackRecent(c ? { kind: 'company', id: c.id, title: c.name, sub: c.city ?? undefined, to: `/companies/${c.id}` } : null);

  const remove = useMutation({
    mutationFn: () => api(`/companies/${id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success('Entreprise supprimée');
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
        <ArrowLeft className="h-4 w-4" /> Entreprises
      </Link>

      <RecordHeader
        icon={Building2}
        typeLabel="Entreprise"
        title={c.name}
        actions={
          <>
            <Button variant="secondary" onClick={() => setModal('contact')}>
              <Plus className="h-4 w-4" /> Contact
            </Button>
            <Button variant="secondary" onClick={() => setModal('deal')}>
              <Plus className="h-4 w-4" /> Opportunité
            </Button>
            <Link to={`/documents/new/QUOTE?companyId=${c.id}`}>
              <Button>
                <FilePlus className="h-4 w-4" /> Devis
              </Button>
            </Link>
            <Button
              variant="danger"
              aria-label="Supprimer l’entreprise"
              loading={remove.isPending}
              onClick={async () =>
                (await confirmDialog({
                  title: `Supprimer « ${c.name} » ?`,
                  message: 'Les activités liées seront supprimées. Les contacts et opportunités sont conservés, sans entreprise.',
                  confirmLabel: 'Supprimer',
                  danger: true,
                })) && remove.mutate()
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        }
        highlights={[
          { label: 'Secteur', value: c.industry },
          {
            label: 'Téléphone',
            value: c.phone && (
              <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                <Phone className="h-3 w-3" /> {c.phone}
              </a>
            ),
          },
          {
            label: 'Site web',
            value: website && (
              <a href={website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                <Globe className="h-3 w-3" /> {c.website}
              </a>
            ),
          },
          { label: 'Opportunités en cours', value: `${openDeals.length} · ${money(openDeals.reduce((s, d) => s + Number(d.amount), 0), true)}` },
          { label: 'CA gagné', value: money(wonTotal, true) },
          { label: 'Responsable', value: <Owner owner={c.owner} /> },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'activity', label: 'Activité', count: c.activities?.length ?? 0 },
              { value: 'details', label: 'Détails' },
            ]}
          />
          {tab === 'activity' ? (
            <>
              <ActivityComposer links={{ companyId: c.id }} />
              <Timeline activities={c.activities ?? []} />
            </>
          ) : (
            <dl className="grid gap-x-8 px-4 py-2 sm:grid-cols-2">
              <InlineField label="Raison sociale" value={c.name} onSave={save('name', (v) => v)} />
              <InlineField label="Identifiant fiscal" value={c.taxId} onSave={save('taxId')} />
              <InlineField label="Secteur d’activité" value={c.industry} onSave={save('industry')} />
              <InlineField
                label="Effectif"
                type="select"
                value={c.size ?? ''}
                display={c.size ? `${c.size} salariés` : undefined}
                options={[{ value: '', label: '—' }, ...COMPANY_SIZES.map((s) => ({ value: s, label: `${s} salariés` }))]}
                onSave={save('size')}
              />
              <InlineField label="Email" type="email" value={c.email} onSave={save('email')} />
              <InlineField label="Téléphone" type="tel" value={c.phone} onSave={save('phone')} />
              <InlineField label="Site web" type="url" value={c.website} onSave={save('website')} />
              <InlineField
                label="Responsable"
                type="select"
                value={c.ownerId ?? ''}
                display={<Owner owner={c.owner} />}
                options={[{ value: '', label: '— Non attribué —' }, ...(users ?? []).filter((u) => u.active).map((u) => ({ value: u.id, label: u.name }))]}
                onSave={save('ownerId')}
              />
              <InlineField label="Adresse" value={c.address} onSave={save('address')} className="sm:col-span-2" />
              <InlineField label="Ville" value={c.city} onSave={save('city')} />
              <InlineField label="Pays" value={c.country} onSave={save('country')} />
              <InlineField label="Notes" type="textarea" value={c.notes} onSave={save('notes')} className="sm:col-span-2" />
              <InlineField label="Créée le" value={formatDate(c.createdAt)} readOnly />
            </dl>
          )}
        </section>

        <div className="space-y-6">
          <Card
            title={`Contacts (${c.contacts?.length ?? 0})`}
            actions={
              <Button size="sm" variant="ghost" onClick={() => setModal('contact')}>
                <Plus className="h-4 w-4" /> Ajouter
              </Button>
            }
          >
            <ContactRows contacts={c.contacts ?? []} />
          </Card>
          <Card
            title={`Opportunités (${deals.length})`}
            actions={
              <Button size="sm" variant="ghost" onClick={() => setModal('deal')}>
                <Plus className="h-4 w-4" /> Ajouter
              </Button>
            }
          >
            <DealRows deals={deals} />
          </Card>
          <Card title={`Devis & factures (${c.documents?.length ?? 0})`}>
            <DocumentRows documents={c.documents ?? []} />
          </Card>
        </div>
      </div>

      {modal === 'contact' && <ContactForm open defaultCompany={ref} onClose={() => setModal(null)} />}
      {modal === 'deal' && <DealForm open defaults={{ company: ref }} onClose={() => setModal(null)} />}
    </>
  );
}
