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

import { t } from '../lib/i18n';
/** Étapes ouvertes du cycle de vente, avec les bonnes pratiques de chacune. */
const DEAL_PATH: PathStep[] = [
  { value: 'NEW', label: t('Nouveau'), guidance: [t('Qualifier le besoin : budget, décideur, délai.'), t('Planifier un premier appel de découverte.')] },
  { value: 'QUALIFIED', label: t('Qualifié'), guidance: [t('Confirmer le décideur et le budget.'), t('Identifier les concurrents et les critères de choix.')] },
  { value: 'PROPOSAL', label: t('Proposition'), guidance: [t('Envoyer le devis (bouton « Créer un devis »).'), t('Planifier une relance dans les 7 jours.')] },
  { value: 'NEGOTIATION', label: t('Négociation'), guidance: [t('Lever les objections, ajuster le devis si nécessaire.'), t('Fixer la date de signature, puis clôturer : Gagnée ou Perdue.')] },
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
      if (deal.stage === 'WON') toast.success(t('🎉 Bravo ! « {title} » est gagnée', { title: deal.title }));
      else if (deal.stage === 'LOST') toast.info(t('Opportunité marquée perdue'));
      else toast.success(t('Étape : {stage}', { stage: label(STAGES, deal.stage) }));
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => api(`/deals/${id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(t('Opportunité supprimée'));
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
        <ArrowLeft className="h-4 w-4" /> {t("Pipeline")}
      </Link>

      <RecordHeader
        icon={KanbanSquare}
        typeLabel={t("Opportunité")}
        title={d.title}
        badges={<Badge tone={tone(STAGES, d.stage)}>{label(STAGES, d.stage)}</Badge>}
        actions={
          <>
            <Link to={`/documents/new/QUOTE?dealId=${d.id}`}>
              <Button>
                <FilePlus className="h-4 w-4" /> {t("Créer un devis")}
              </Button>
            </Link>
            <Button
              variant="danger"
              aria-label={t("Supprimer l’opportunité")}
              onClick={async () => (await confirmDialog({ title: t('Supprimer « {name} » ?', { name: d.title }), message: t('Ses activités seront également supprimées.'), confirmLabel: t('Supprimer'), danger: true })) && remove.mutate()}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        }
        highlights={[
          { label: t('Montant HT'), value: money(d.amount) },
          { label: t('Probabilité'), value: `${d.probability} %` },
          { label: t('Montant pondéré'), value: money((Number(d.amount) * d.probability) / 100) },
          {
            label: closed ? t('Clôturée le') : t('Clôture prévue'),
            value: <span className={late ? 'text-red-600' : ''}>{formatDate(closed ? d.closedAt : d.expectedCloseDate)}{late && t(' · dépassée')}</span>,
          },
          {
            label: t('Entreprise'),
            value: d.company ? (
              <Link to={`/companies/${d.company.id}`} className="text-indigo-600 hover:underline">
                {d.company.name}
              </Link>
            ) : null,
          },
          { label: t('Responsable'), value: <Owner owner={d.owner} /> },
        ]}
      />

      <StagePath
        steps={DEAL_PATH}
        current={d.stage}
        final={d.stage === 'WON' ? { label: t('Gagnée'), tone: 'won' } : d.stage === 'LOST' ? { label: t('Perdue'), tone: 'lost' } : null}
        onChange={(s) => setStage.mutate(s as DealStage)}
        onWin={() => setStage.mutate('WON')}
        onLose={async () => (await confirmDialog({ title: t('Marquer l’opportunité comme perdue ?'), message: t('Pensez à consigner la raison dans une note.'), confirmLabel: t('Marquer perdue'), danger: true })) && setStage.mutate('LOST')}
        onReopen={() => setStage.mutate('NEGOTIATION')}
        pending={setStage.isPending}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'activity', label: t('Activité'), count: d.activities?.length ?? 0 },
              { value: 'details', label: t('Détails') },
            ]}
          />
          {tab === 'activity' ? (
            <>
              <ActivityComposer links={links} />
              <Timeline activities={d.activities ?? []} />
            </>
          ) : (
            <dl className="grid gap-x-8 px-4 py-2 sm:grid-cols-2">
              <InlineField label={t("Intitulé")} value={d.title} onSave={save('title', (v) => v)} />
              <InlineField label={t("Montant HT")} type="number" value={Number(d.amount)} display={money(d.amount)} onSave={save('amount', num)} />
              <InlineField
                label={t("Étape")}
                type="select"
                value={d.stage}
                display={label(STAGES, d.stage)}
                options={STAGES.map((s) => ({ value: s.value, label: s.label }))}
                onSave={save('stage', (v) => v)}
              />
              <InlineField label={t("Probabilité (%)")} type="number" value={d.probability} display={`${d.probability} %`} onSave={save('probability', num)} />
              <InlineField label={t("Clôture prévue")} type="date" value={d.expectedCloseDate} display={formatDate(d.expectedCloseDate)} onSave={save('expectedCloseDate')} />
              <InlineField
                label={t("Responsable")}
                type="select"
                value={d.ownerId ?? ''}
                display={<Owner owner={d.owner} />}
                options={[{ value: '', label: t('— Non attribué —') }, ...(users ?? []).filter((u) => u.active).map((u) => ({ value: u.id, label: u.name }))]}
                onSave={save('ownerId')}
              />
              <InlineField label={t("Notes")} type="textarea" value={d.notes} onSave={save('notes')} className="sm:col-span-2" />
              <InlineField label={t("Créée le")} value={formatDate(d.createdAt)} readOnly />
              <InlineField label={t("Dernière modification")} value={formatDate(d.updatedAt, true)} readOnly />
            </dl>
          )}
        </section>

        <div className="space-y-6">
          <Card title={t("Contact principal")}>
            {d.contact ? (
              <Link to={`/contacts/${d.contact.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <User className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-800">{fullName(d.contact)}</span>
              </Link>
            ) : (
              <EmptyState title={t("Aucun contact associé")} icon={User} />
            )}
            {d.company && (
              <Link to={`/companies/${d.company.id}`} className="flex items-center gap-3 border-t border-slate-100 px-4 py-3 hover:bg-slate-50">
                <Building2 className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-700">{d.company.name}</span>
              </Link>
            )}
          </Card>
          <Card
            title={t('Devis & factures ({n})', { n: d.documents?.length ?? 0 })}
            actions={
              <Link to={`/documents/new/QUOTE?dealId=${d.id}`} className="text-xs font-medium text-indigo-600 hover:underline">
                {t("+ Devis")}
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
