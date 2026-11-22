import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate, fullName } from '../lib/format';
import { CONTACT_STATUSES, label, tone } from '../lib/labels';
import type { Contact, Deal } from '../types';
import { Badge, Button, Card, ErrorBox, InfoRow, PageHeader, Spinner } from '../components/ui';
import { ActivityForm, ContactForm, DealForm } from '../components/forms';
import { ActivityList } from '../components/ActivityList';
import { confirmDialog, toast } from '../components/feedback';
import { DealRows, DocumentRows } from '../components/RelatedLists';

export default function ContactDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [modal, setModal] = useState<'edit' | 'deal' | 'activity' | null>(null);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);

  const { data: c, isLoading, error } = useQuery({ queryKey: ['contact', id], queryFn: () => api<Contact>(`/contacts/${id}`) });
  const remove = useMutation({
    mutationFn: () => api(`/contacts/${id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success('Contact supprimé');
      navigate('/contacts');
    },
  });

  if (isLoading) return <Spinner />;
  if (error || !c) return <ErrorBox error={error} />;
  const contactRef = { id: c.id, firstName: c.firstName, lastName: c.lastName };
  const companyRef = c.company ?? undefined;

  return (
    <>
      <Link to="/contacts" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Contacts
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {fullName(c)} <Badge tone={tone(CONTACT_STATUSES, c.status)}>{label(CONTACT_STATUSES, c.status)}</Badge>
          </span>
        }
        subtitle={
          <>
            {c.position}
            {c.position && c.company && ' chez '}
            {c.company && (
              <Link to={`/companies/${c.company.id}`} className="text-indigo-600 hover:underline">
                {c.company.name}
              </Link>
            )}
          </>
        }
        actions={
          <>
            {c.phone && (
              <a href={`tel:${c.phone}`}>
                <Button variant="secondary">
                  <Phone className="h-4 w-4" /> Appeler
                </Button>
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`}>
                <Button variant="secondary">
                  <Mail className="h-4 w-4" /> Email
                </Button>
              </a>
            )}
            <Button variant="secondary" onClick={() => setModal('edit')}>
              <Pencil className="h-4 w-4" /> Modifier
            </Button>
            <Button variant="danger" onClick={async () => (await confirmDialog({ title: `Supprimer ${fullName(c)} ?`, message: 'Ses activités seront également supprimées.', confirmLabel: 'Supprimer', danger: true })) && remove.mutate()}
              aria-label="Supprimer le contact" loading={remove.isPending}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        }
      />
      <ErrorBox error={remove.error} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Informations">
          <dl className="px-4 py-2">
            <InfoRow label="Email">{c.email}</InfoRow>
            <InfoRow label="Téléphone">{c.phone}</InfoRow>
            <InfoRow label="Fonction">{c.position}</InfoRow>
            <InfoRow label="Source">{c.source}</InfoRow>
            <InfoRow label="Responsable">{c.owner?.name}</InfoRow>
            <InfoRow label="Créé le">{formatDate(c.createdAt)}</InfoRow>
          </dl>
          {c.notes && <p className="whitespace-pre-wrap border-t border-slate-100 px-4 py-3 text-sm text-slate-600">{c.notes}</p>}
        </Card>

        <div className="space-y-6 lg:col-span-2">
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
          <Card title="Devis & factures">
            <DocumentRows documents={c.documents ?? []} />
          </Card>
        </div>
      </div>

      {modal === 'edit' && <ContactForm open contact={c} onClose={() => setModal(null)} />}
      {modal === 'deal' && <DealForm open defaults={{ company: companyRef, contact: contactRef }} onClose={() => setModal(null)} />}
      {modal === 'activity' && <ActivityForm open defaults={{ company: companyRef, contact: contactRef }} onClose={() => setModal(null)} />}
      {editDeal && <DealForm open deal={editDeal} onClose={() => setEditDeal(null)} />}
    </>
  );
}
