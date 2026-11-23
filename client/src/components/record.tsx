import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Check, Lightbulb, Loader2, Mail, Pencil, Phone, StickyNote, Users, X, ListTodo } from 'lucide-react';
import { api } from '../lib/api';
import { fromDateTimeInput, toDateInput } from '../lib/format';
import type { Activity, ActivityType } from '../types';
import { ActivityList } from './ActivityList';
import { toast } from './feedback';
import { Button, EmptyState } from './ui';

import { locale, t } from '../lib/i18n';
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ======================================================================
 * En-tête de fiche : type, titre, actions et « points clés »
 * ==================================================================== */

export interface Highlight {
  label: string;
  value: ReactNode;
}

export function RecordHeader({
  icon: Icon,
  typeLabel,
  title,
  badges,
  actions,
  highlights,
}: {
  icon: typeof Users;
  typeLabel: string;
  title: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  highlights: Highlight[];
}) {
  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-on-accent shadow-sm">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{typeLabel}</div>
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-slate-900 sm:text-2xl">
              <span className="min-w-0 break-words">{title}</span>
              {badges}
            </h1>
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:grid-cols-3 sm:px-5 lg:grid-cols-6">
        {highlights.map((h) => (
          <div key={h.label} className="min-w-0">
            <dt className="truncate text-xs text-slate-500">{h.label}</dt>
            <dd className="mt-0.5 truncate text-sm font-medium text-slate-800">{h.value || <span className="font-normal text-slate-400">—</span>}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ======================================================================
 * Chemin d'étapes (« path ») : où en est la fiche, quoi faire ensuite
 * ==================================================================== */

export interface PathStep {
  value: string;
  label: string;
  guidance?: string[];
}

export function StagePath({
  steps,
  current,
  final,
  onChange,
  pending,
  onWin,
  onLose,
  onReopen,
  readOnly,
}: {
  readOnly?: boolean;
  steps: PathStep[];
  current: string;
  /** Issue finale (ex. Gagnée / Perdue) : toutes les étapes sont alors terminées */
  final?: { label: string; tone: 'won' | 'lost' } | null;
  onChange: (value: string) => void;
  pending?: boolean;
  onWin?: () => void;
  onLose?: () => void;
  onReopen?: () => void;
}) {
  const currentIndex = final ? steps.length : steps.findIndex((s) => s.value === current);
  const [selected, setSelected] = useState(Math.min(Math.max(currentIndex, 0), steps.length - 1));
  useEffect(() => setSelected(Math.min(Math.max(currentIndex, 0), steps.length - 1)), [currentIndex, steps.length]);

  const sel = steps[selected];
  const isCurrent = selected === currentIndex;
  const next = steps[currentIndex + 1];

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <ol className="flex flex-1 overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label={t("Étapes")}>
          {steps.map((s, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex;
            const first = i === 0;
            return (
              <li key={s.value} className={cx('min-w-[7.5rem] flex-1', !first && '-ml-1.5')}>
                <button
                  type="button"
                  onClick={() => setSelected(i)}
                  aria-current={active ? 'step' : undefined}
                  aria-pressed={selected === i}
                  style={{ clipPath: first ? 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)' : 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)' }}
                  className={cx(
                    'flex h-10 w-full items-center justify-center gap-1.5 px-5 text-sm font-medium transition-colors',
                    first && 'rounded-l-lg',
                    done && 'bg-emerald-600 text-on-accent hover:bg-emerald-700',
                    active && 'bg-indigo-600 text-on-accent',
                    !done && !active && 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    selected === i && !active && 'ring-2 ring-inset ring-indigo-400',
                  )}
                >
                  {done && <Check className="h-4 w-4 shrink-0" />}
                  <span className="truncate">{s.label}</span>
                </button>
              </li>
            );
          })}
          {final !== undefined && (
            <li className="-ml-1.5 min-w-[7.5rem] flex-1">
              <div
                style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 12px 50%)' }}
                className={cx(
                  'flex h-10 w-full items-center justify-center gap-1.5 rounded-r-lg px-5 text-sm font-medium',
                  final?.tone === 'won' && 'bg-emerald-600 text-on-accent',
                  final?.tone === 'lost' && 'bg-red-600 text-on-accent',
                  !final && 'bg-slate-100 text-slate-500',
                )}
              >
                {final ? (
                  <>
                    {final.tone === 'won' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    {final.label}
                  </>
                ) : (
                  t('Clôture')
                )}
              </div>
            </li>
          )}
        </ol>
        <div className="flex shrink-0 flex-wrap gap-2">
          {readOnly ? null : final ? (
            onReopen && (
              <Button variant="secondary" onClick={onReopen} loading={pending}>
                {t("Rouvrir")}
              </Button>
            )
          ) : isCurrent && next ? (
            <Button onClick={() => onChange(next.value)} loading={pending}>
              <Check className="h-4 w-4" /> {t("Étape terminée")}
            </Button>
          ) : isCurrent && (onWin || onLose) ? (
            <>
              {onWin && (
                <Button onClick={onWin} loading={pending} className="!bg-emerald-600 hover:!bg-emerald-700">
                  <Check className="h-4 w-4" /> {t("Gagnée")}
                </Button>
              )}
              {onLose && (
                <Button variant="danger" onClick={onLose} disabled={pending}>
                  <X className="h-4 w-4" /> {t("Perdue")}
                </Button>
              )}
            </>
          ) : !isCurrent ? (
            <Button variant="secondary" onClick={() => onChange(sel.value)} loading={pending}>
              {t("Passer à «")} {sel.label} »
            </Button>
          ) : null}
        </div>
      </div>
      {sel?.guidance && !final && (
        <div className="mt-3 flex gap-3 rounded-lg bg-amber-50 px-3 py-2.5 text-sm">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <div className="font-medium text-slate-800">{t("Conseils pour l’étape «")} {sel.label} »</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-600">
              {sel.guidance.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

/* ======================================================================
 * Champ modifiable sur place (clic sur le crayon, Entrée pour valider)
 * ==================================================================== */

type FieldType = 'text' | 'email' | 'tel' | 'url' | 'number' | 'date' | 'textarea' | 'select';

export function InlineField({
  label,
  value,
  display,
  type = 'text',
  options,
  onSave,
  readOnly,
  className,
}: {
  label: string;
  value: string | number | null | undefined;
  display?: ReactNode;
  type?: FieldType;
  options?: { value: string; label: string }[];
  onSave?: (v: string) => Promise<unknown>;
  readOnly?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>(null);

  const start = () => {
    if (readOnly || !onSave) return;
    setDraft(type === 'date' ? toDateInput(value as string) : value == null ? '' : String(value));
    setEditing(true);
  };
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Enregistrement impossible'));
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'block w-full rounded-md border border-indigo-400 bg-white px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30';
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setEditing(false);
    if (e.key === 'Enter' && type !== 'textarea') save(e as unknown as FormEvent);
  };

  return (
    <div className={cx('group border-b border-slate-100 py-2', className)}>
      <dt className="text-xs text-slate-500">{label}</dt>
      {editing ? (
        <form onSubmit={save} className="mt-1 flex items-start gap-1.5">
          {type === 'textarea' ? (
            <textarea ref={inputRef} rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} className={inputCls} />
          ) : type === 'select' ? (
            <select ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} className={inputCls}>
              {options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input ref={inputRef} type={type} step={type === 'number' ? '0.01' : undefined} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} className={inputCls} />
          )}
          <button type="submit" disabled={saving} className="rounded-md bg-indigo-600 p-1.5 text-on-accent hover:bg-indigo-700" aria-label={t("Enregistrer")}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="rounded-md border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-50" aria-label={t("Annuler")}>
            <X className="h-3.5 w-3.5" />
          </button>
        </form>
      ) : (
        <dd className="flex min-h-6 items-start justify-between gap-2">
          <span className={cx('min-w-0 break-words text-sm', type === 'textarea' && 'whitespace-pre-wrap', value == null || value === '' ? 'text-slate-400' : 'text-slate-800')}>
            {display ?? (value == null || value === '' ? '—' : String(value))}
          </span>
          {!readOnly && onSave && (
            <button
              onClick={start}
              className="shrink-0 rounded p-0.5 text-slate-300 opacity-100 hover:bg-slate-100 hover:text-slate-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
              aria-label={t('Modifier {field}', { field: label })}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </dd>
      )}
    </div>
  );
}

/** Enregistre un champ d'une fiche (PATCH) et rafraîchit les données. */
export function useFieldSaver(path: string, enabled = true) {
  const qc = useQueryClient();
  // Sans droit de modification : pas de fonction d'enregistrement, donc pas de crayon
  return (field: string, transform: (v: string) => unknown = (v) => (v === '' ? null : v)) =>
    !enabled
      ? undefined
      : async (v: string) => {
      await api(path, 'PATCH', { [field]: transform(v) });
      await qc.invalidateQueries();
      toast.success(t('Modification enregistrée'));
    };
}

/* ======================================================================
 * Onglets simples
 * ==================================================================== */

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200 px-2">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
            value === t.value ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ======================================================================
 * Compositeur d'activité : consigner un appel, une note, planifier une tâche…
 * ==================================================================== */

const COMPOSER: { type: ActivityType; label: string; icon: typeof Phone; placeholder: string; planned: boolean; defaultSubject: string }[] = [
  { type: 'CALL', label: t('Appel'), icon: Phone, placeholder: t('Compte rendu de l’appel…'), planned: false, defaultSubject: t('Appel') },
  { type: 'NOTE', label: t('Note'), icon: StickyNote, placeholder: t('Écrire une note…'), planned: false, defaultSubject: t('Note') },
  { type: 'TASK', label: t('Tâche'), icon: ListTodo, placeholder: t('Détails de la tâche (facultatif)…'), planned: true, defaultSubject: '' },
  { type: 'MEETING', label: t('Rendez-vous'), icon: Calendar, placeholder: t('Ordre du jour, lieu…'), planned: true, defaultSubject: '' },
  { type: 'EMAIL', label: t('Email'), icon: Mail, placeholder: t('Résumé de l’email envoyé…'), planned: false, defaultSubject: t('Email') },
];

export interface ComposerLinks {
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
}

export function ActivityComposer({ links }: { links: ComposerLinks }) {
  const qc = useQueryClient();
  const [type, setType] = useState<ActivityType>('CALL');
  const conf = COMPOSER.find((c) => c.type === type)!;
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const tomorrow = new Date(Date.now() + 86400000);
  tomorrow.setHours(9, 0, 0, 0);
  const [due, setDue] = useState(`${toDateInput(tomorrow)}T09:00`);

  const save = useMutation({
    mutationFn: () =>
      api<Activity>('/activities', 'POST', {
        type,
        subject: subject.trim() || conf.defaultSubject || conf.label,
        description,
        ...links,
        ...(conf.planned ? { dueDate: fromDateTimeInput(due), done: false } : { done: true, dueDate: new Date().toISOString() }),
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(conf.planned ? t('{label} planifié(e)', { label: conf.label }) : t('{label} consigné(e) dans l’historique', { label: conf.label }));
      setSubject('');
      setDescription('');
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (conf.planned && !subject.trim()) {
      toast.error(t('Donnez un objet à la tâche ou au rendez-vous'));
      return;
    }
    save.mutate();
  };

  return (
    <form onSubmit={submit} className="border-b border-slate-100 p-4">
      <div className="mb-3 flex flex-wrap gap-1" role="radiogroup" aria-label={t("Type d’activité")}>
        {COMPOSER.map((c) => (
          <button
            key={c.type}
            type="button"
            role="radio"
            aria-checked={type === c.type}
            onClick={() => setType(c.type)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              type === c.type ? 'bg-indigo-600 text-on-accent' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            <c.icon className="h-3.5 w-3.5" /> {c.label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={conf.planned ? (type === 'TASK' ? t('Objet de la tâche *') : t('Objet du rendez-vous *')) : t('Objet (par défaut : « {s} »)', { s: conf.defaultSubject })}
          aria-label={t("Objet")}
          className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={conf.placeholder}
          aria-label={t("Description")}
          rows={2}
          className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {conf.planned ? (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              {t("Échéance")}
              <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs" />
            </label>
          ) : (
            <span className="text-xs text-slate-500">{t("Consigné maintenant, à votre nom")}</span>
          )}
          <Button type="submit" size="sm" loading={save.isPending}>
            {conf.planned ? t('Planifier') : t('Consigner')}
          </Button>
        </div>
      </div>
    </form>
  );
}

/* ======================================================================
 * Chronologie : « À venir » puis historique groupé par mois
 * ==================================================================== */

const monthLabel = (d: string) => new Date(d).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });

export function Timeline({ activities }: { activities: Activity[] }) {
  const upcoming = activities.filter((a) => !a.done).sort((a, b) => (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'));
  const history = activities
    .filter((a) => a.done)
    .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));
  const groups = new Map<string, Activity[]>();
  for (const a of history) {
    const k = monthLabel(a.completedAt ?? a.createdAt);
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }

  if (!activities.length) return <EmptyState title={t("Aucune activité pour l’instant")}>{t("Consignez un appel ou planifiez une tâche ci-dessus.")}</EmptyState>;

  return (
    <div>
      <TimelineHeading>{t("À venir et en retard")}</TimelineHeading>
      {upcoming.length ? <ActivityList items={upcoming} showLinks={false} /> : <p className="px-4 pb-3 text-sm text-slate-500">{t("Aucune action planifiée.")}</p>}
      {[...groups.entries()].map(([month, items]) => (
        <div key={month}>
          <TimelineHeading>{month}</TimelineHeading>
          <ActivityList items={items} showLinks={false} />
        </div>
      ))}
    </div>
  );
}

function TimelineHeading({ children }: { children: ReactNode }) {
  return <h3 className="bg-slate-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 first-letter:uppercase">{children}</h3>;
}
