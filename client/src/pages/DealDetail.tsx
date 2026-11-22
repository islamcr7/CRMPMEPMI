import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, FilePlus, KanbanSquare, Trash2, User } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate, fullName, isOverdue, useMoney } from '../lib/format';
import { useTrackRecent } from '../lib/recent';
import { STAGES, label, tone } from '../lib/labels';
import type { Deal, DealStage } from '../types';
import { Badge, Button, Card, EmptyState, ErrorBox, Spinner } from '../components/ui';
import { ActivityComposer, InlineField, RecordHeader, StagePath, Tabs, Timeline, useFieldSaver, type PathStep } from '../components/record';
import { DocumentRows } from '../components/RelatedLists';
import { Owner } from '../components/OwnerCell';
import { useUsers } from '../components/pickers';
import { confirmDialog, toast } from '../components/feedback';

/** Étapes ouvertes du cycle de vente, avec les bonnes pratiques de chacune. */
const DEAL_PATH: PathStep[] = [
  { value: 'NEW', label: 'Nouveau', guidance: ['Qualifier le besoin : budget, décideur, délai.', 'Planifier un premier appel de découverte.'] },
  { value: 'QUALIFIED', label: 'Qualifié', guidance: ['Confirmer le décideur et le budget.', 'Identifier les concurrents et les critères de choix.'] },
  { value: 'PROPOSAL', label: 'Proposition', guidance: ['Envoyer le devis (bouton « Créer un devis »).', 'Planifier une relance dans les 7 jours.'] },
  { value: 'NEGOTIATION', label: 'Négociation', guidance: ['Lever les objections, ajuster le devis si nécessaire.', 'Fixer la date de signature, puis clôturer : Gagnée ou Perdue.'] },
];

export default function DealDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const money = useMoney();
  const { data: users } = useUsers();
  const [tab, setTab] = useState<'activity' | 'details'>('activity');
  const { data: d, isLoading, error } = useQuery({ queryKey: ['deal', id], queryFn: () => api<Deal>(`/deals/${id}`) });
  const save = useFieldSaver(`/deals/${id}`);

  useTrackRecent(d ? { kind: 'deal', id: d.id, title: d.title, sub: d.company?.name, to: `/deals/${d.id}` } : null);

  const setStage = useMutation({
    mutationFn: (stage: DealStage) => api<Deal>(`/deals/${id}`, 'PATCH', { stage }),
    onSuccess: (deal) => {
      qc.invalidateQueries();
      if (deal.stage === 'WON') toast.success(`🎉 Bravo ! « ${deal.title} » est gagnée`);
      else if (deal.stage === 'LOST') toast.info('Opportunité marquée perdue');
      else toast.success(`Étape : ${label(STAGES, deal.stage)}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => api(`/deals/${id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success('Opportunité supprimée');
      navigate('/pipeline');
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <Spinner />;
  if (error || !d) return <ErrorBox error={error} />;

  const closed = d.stage === 'WON' || d.stage === 'LOST';
  const late = !closed && isOverdue(d.expectedCloseDate);
  const links = { dealId: d.id, companyId: d.companyId, contactId: d.contactId };
  const num = (v: string) => (v === '' ? 0 : Number(v));

  return (
    <>
      <Link to="/pipeline" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Pipeline
      </Link>

      <RecordHeader
        icon={KanbanSquare}
        typeLabel="Opportunité"
        title={d.title}
        badges={<Badge tone={tone(STAGES, d.stage)}>{label(STAGES, d.stage)}</Badge>}
        actions={
          <>
            <Link to={`/documents/new/QUOTE?dealId=${d.id}`}>
              <Button>
                <FilePlus className="h-4 w-4" /> Créer un devis
              </Button>
            </Link>
            <Button
              variant="danger"
              aria-label="Supprimer l’opportunité"
              onClick={async () => (await confirmDialog({ title: `Supprimer « ${d.title} » ?`, message: 'Ses activités seront également supprimées.', confirmLabel: 'Supprimer', danger: true })) && remove.mutate()}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        }
        highlights={[
          { label: 'Montant HT', value: money(d.amount) },
          { label: 'Probabilité', value: `${d.probability} %` },
          { label: 'Montant pondéré', value: money((Number(d.amount) * d.probability) / 100) },
          {
            label: closed ? 'Clôturée le' : 'Clôture prévue',
            value: <span className={late ? 'text-red-600' : ''}>{formatDate(closed ? d.closedAt : d.expectedCloseDate)}{late && ' · dépassée'}</span>,
          },
          {
            label: 'Entreprise',
            value: d.company ? (
              <Link to={`/companies/${d.company.id}`} className="text-indigo-600 hover:underline">
                {d.company.name}
              </Link>
            ) : null,
          },
          { label: 'Responsable', value: <Owner owner={d.owner} /> },
        ]}
      />

      <StagePath
        steps={DEAL_PATH}
        current={d.stage}
        final={d.stage === 'WON' ? { label: 'Gagnée', tone: 'won' } : d.stage === 'LOST' ? { label: 'Perdue', tone: 'lost' } : null}
        onChange={(s) => setStage.mutate(s as DealStage)}
        onWin={() => setStage.mutate('WON')}
        onLose={async () => (await confirmDialog({ title: 'Marquer l’opportunité comme perdue ?', message: 'Pensez à consigner la raison dans une note.', confirmLabel: 'Marquer perdue', danger: true })) && setStage.mutate('LOST')}
        onReopen={() => setStage.mutate('NEGOTIATION')}
        pending={setStage.isPending}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'activity', label: 'Activité', count: d.activities?.length ?? 0 },
              { value: 'details', label: 'Détails' },
            ]}
          />
          {tab === 'activity' ? (
            <>
              <ActivityComposer links={links} />
              <Timeline activities={d.activities ?? []} />
            </>
          ) : (
            <dl className="grid gap-x-8 px-4 py-2 sm:grid-cols-2">
              <InlineField label="Intitulé" value={d.title} onSave={save('title', (v) => v)} />
              <InlineField label="Montant HT" type="number" value={Number(d.amount)} display={money(d.amount)} onSave={save('amount', num)} />
              <InlineField
                label="Étape"
                type="select"
                value={d.stage}
                display={label(STAGES, d.stage)}
                options={STAGES.map((s) => ({ value: s.value, label: s.label }))}
                onSave={save('stage', (v) => v)}
              />
              <InlineField label="Probabilité (%)" type="number" value={d.probability} display={`${d.probability} %`} onSave={save('probability', num)} />
              <InlineField label="Clôture prévue" type="date" value={d.expectedCloseDate} display={formatDate(d.expectedCloseDate)} onSave={save('expectedCloseDate')} />
              <InlineField
                label="Responsable"
                type="select"
                value={d.ownerId ?? ''}
                display={<Owner owner={d.owner} />}
                options={[{ value: '', label: '— Non attribué —' }, ...(users ?? []).filter((u) => u.active).map((u) => ({ value: u.id, label: u.name }))]}
                onSave={save('ownerId')}
              />
              <InlineField label="Notes" type="textarea" value={d.notes} onSave={save('notes')} className="sm:col-span-2" />
              <InlineField label="Créée le" value={formatDate(d.createdAt)} readOnly />
              <InlineField label="Dernière modification" value={formatDate(d.updatedAt, true)} readOnly />
            </dl>
          )}
        </section>

        <div className="space-y-6">
          <Card title="Contact principal">
            {d.contact ? (
              <Link to={`/contacts/${d.contact.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <User className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-800">{fullName(d.contact)}</span>
              </Link>
            ) : (
              <EmptyState title="Aucun contact associé" icon={User} />
            )}
            {d.company && (
              <Link to={`/companies/${d.company.id}`} className="flex items-center gap-3 border-t border-slate-100 px-4 py-3 hover:bg-slate-50">
                <Building2 className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-700">{d.company.name}</span>
              </Link>
            )}
          </Card>
          <Card
            title={`Devis & factures (${d.documents?.length ?? 0})`}
            actions={
              <Link to={`/documents/new/QUOTE?dealId=${d.id}`} className="text-xs font-medium text-indigo-600 hover:underline">
                + Devis
              </Link>
            }
          >
            <DocumentRows documents={d.documents ?? []} />
          </Card>
        </div>
      </div>
    </>
  );
}
