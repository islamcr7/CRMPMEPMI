import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FilePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import type { Company, Deal } from '../types';
import { Button, Card, ErrorBox, InfoRow, PageHeader, Spinner } from '../components/ui';
import { ActivityForm, CompanyForm, ContactForm, DealForm } from '../components/forms';
import { ActivityList } from '../components/ActivityList';
import { confirmDialog, toast } from '../components/feedback';
import { ContactRows, DealRows, DocumentRows } from '../components/RelatedLists';

export default function CompanyDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [modal, setModal] = useState<'edit' | 'contact' | 'deal' | 'activity' | null>(null);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);

  const { data: c, isLoading, error } = useQuery({ queryKey: ['company', id], queryFn: () => api<Company>(`/companies/${id}`) });
  const remove = useMutation({
    mutationFn: () => api(`/companies/${id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success('Entreprise supprimée');
      navigate('/companies');
    },
  });

  if (isLoading) return <Spinner />;
  if (error || !c) return <ErrorBox error={error} />;
  const ref = { id: c.id, name: c.name };

  return (
    <>
      <Link to="/companies" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Entreprises
      </Link>
      <PageHeader
        title={c.name}
        subtitle={[c.industry, c.city, c.owner && `Responsable : ${c.owner.name}`].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setModal('edit')}>
              <Pencil className="h-4 w-4" /> Modifier
            </Button>
            <Link to={`/documents/new/QUOTE?companyId=${c.id}`}>
              <Button variant="secondary">
                <FilePlus className="h-4 w-4" /> Devis
              </Button>
            </Link>
            <Button variant="danger" onClick={async () =>
                (await confirmDialog({ title: `Supprimer « ${c.name} » ?`, message: 'Les activités liées seront supprimées. Les contacts et opportunités sont conservés, sans entreprise.', confirmLabel: 'Supprimer', danger: true })) &&
                remove.mutate()
              }
              aria-label="Supprimer l’entreprise" loading={remove.isPending}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        }
      />
      <ErrorBox error={remove.error} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card title="Informations">
            <dl className="px-4 py-2">
              <InfoRow label="Email">{c.email && <a href={`mailto:${c.email}`} className="text-indigo-600 hover:underline">{c.email}</a>}</InfoRow>
              <InfoRow label="Téléphone">{c.phone && <a href={`tel:${c.phone}`} className="text-indigo-600 hover:underline">{c.phone}</a>}</InfoRow>
              <InfoRow label="Site web">
                {c.website && (
                  <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                    {c.website}
                  </a>
                )}
              </InfoRow>
              <InfoRow label="Adresse">{[c.address, c.city, c.country].filter(Boolean).join(', ')}</InfoRow>
              <InfoRow label="Identifiant fiscal">{c.taxId}</InfoRow>
              <InfoRow label="Effectif">{c.size && `${c.size} salariés`}</InfoRow>
            </dl>
            {c.notes && <p className="whitespace-pre-wrap border-t border-slate-100 px-4 py-3 text-sm text-slate-600">{c.notes}</p>}
          </Card>
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
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card
            title="Opportunités"
            actions={
              <Button size="sm" variant="ghost" onClick={() => setModal('deal')}>
                <Plus className="h-4 w-4" /> Ajouter
              </Button>
            }
          >
            <DealRows deals={c.deals ?? []} onEdit={setEditDeal} />
          </Card>
          <Card
            title="Activités"
            actions={
              <Button size="sm" variant="ghost" onClick={() => setModal('activity')}>
                <Plus className="h-4 w-4" /> Ajouter
              </Button>
            }
          >
            <ActivityList items={c.activities ?? []} />
          </Card>
          <Card title="Devis & factures">
            <DocumentRows documents={c.documents ?? []} />
          </Card>
        </div>
      </div>

      {modal === 'edit' && <CompanyForm open company={c} onClose={() => setModal(null)} />}
      {modal === 'contact' && <ContactForm open defaultCompany={ref} onClose={() => setModal(null)} />}
      {modal === 'deal' && <DealForm open defaults={{ company: ref }} onClose={() => setModal(null)} />}
      {modal === 'activity' && <ActivityForm open defaults={{ company: ref }} onClose={() => setModal(null)} />}
      {editDeal && <DealForm open deal={editDeal} onClose={() => setEditDeal(null)} />}
    </>
  );
}
