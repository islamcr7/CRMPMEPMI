import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, CheckSquare, FileText, Mail, Pencil, Phone, Square, StickyNote, Trash2, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ACTIVITY_TYPES, label } from '../lib/labels';
import { formatDate, fullName, isOverdue } from '../lib/format';
import type { Activity, ActivityType } from '../types';
import { ActivityForm } from './forms';
import { Avatar, EmptyState } from './ui';
import { confirmDialog, toast } from './feedback';

import { t } from '../lib/i18n';
export const ACTIVITY_ICONS: Record<ActivityType, typeof Phone> = {
  CALL: Phone,
  MEETING: Users,
  EMAIL: Mail,
  TASK: FileText,
  NOTE: StickyNote,
};

export function ActivityList({ items, showLinks = true, emptyText = t('Aucune activité') }: { items: Activity[]; showLinks?: boolean; emptyText?: string }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [editing, setEditing] = useState<Activity | null>(null);
  const toggle = useMutation({
    mutationFn: (a: Activity) => api(`/activities/${a.id}`, 'PATCH', { done: !a.done }),
    onSuccess: (_d, a) => {
      qc.invalidateQueries();
      if (!a.done) toast.success(t('« {subject} » terminé ✓', { subject: a.subject }));
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (a: Activity) => api(`/activities/${a.id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(t('Activité supprimée'));
    },
    onError: (e) => toast.error(e.message),
  });

  if (items.length === 0) return <EmptyState title={emptyText} />;

  return (
    <>
      <ul className="divide-y divide-slate-100">
        {items.map((a) => {
          const Icon = ACTIVITY_ICONS[a.type];
          const late = !a.done && isOverdue(a.dueDate);
          return (
            <li key={a.id} className="group flex items-start gap-3 px-4 py-3">
              {a.type === 'NOTE' || !can('activities.edit') ? (
                a.type === 'NOTE' ? (
                  <StickyNote className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                ) : a.done ? (
                  <CheckSquare className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <Square className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />
                )
              ) : (
                <button
                  onClick={() => toggle.mutate(a)}
                  className="mt-0.5 shrink-0 text-slate-400 hover:text-indigo-600"
                  aria-label={a.done ? t('Marquer comme à faire') : t('Marquer comme fait')}
                >
                  {a.done ? <CheckSquare className="h-5 w-5 text-emerald-600" /> : <Square className="h-5 w-5" />}
                </button>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Icon className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-xs text-slate-500">{label(ACTIVITY_TYPES, a.type)}</span>
                  <span className={`text-sm font-medium ${a.done && a.type !== 'NOTE' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{a.subject}</span>
                </div>
                {a.description && <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{a.description}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  {a.dueDate && (
                    <span className={`inline-flex items-center gap-1 ${late ? 'font-medium text-red-600' : ''}`}>
                      <Calendar className="h-3 w-3" />
                      {formatDate(a.dueDate, true)}
                      {late && t(' · en retard')}
                    </span>
                  )}
                  {showLinks && a.company && (
                    <Link to={`/companies/${a.company.id}`} className="hover:text-indigo-600 hover:underline">
                      {a.company.name}
                    </Link>
                  )}
                  {showLinks && a.contact && (
                    <Link to={`/contacts/${a.contact.id}`} className="hover:text-indigo-600 hover:underline">
                      {fullName(a.contact)}
                    </Link>
                  )}
                  {showLinks && a.deal && <span>↳ {a.deal.title}</span>}
                  {a.assignee && (
                    <span className="inline-flex items-center gap-1">
                      <Avatar name={a.assignee.name} size="xs" /> {a.assignee.name}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                {can('activities.edit') && (
                <button onClick={() => setEditing(a)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={t("Modifier")}>
                  <Pencil className="h-4 w-4" />
                </button>
                )}
                {can('activities.delete') && (
                <button
                  onClick={async () => (await confirmDialog({ title: t('Supprimer cette activité ?'), message: a.subject, confirmLabel: t('Supprimer'), danger: true })) && remove.mutate(a)}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={t("Supprimer")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {editing && <ActivityForm open onClose={() => setEditing(null)} activity={editing} />}
    </>
  );
}
