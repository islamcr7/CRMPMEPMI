import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/format';
import type { AppRole, User } from '../types';
import { Badge, Button, Card, ErrorBox, FormActions, Input, Modal, PageHeader, Select, Spinner } from '../components/ui';
import { useUsers } from '../components/pickers';
import { toast } from '../components/feedback';

import { t, tMaybe } from '../lib/i18n';
function UserForm({ user, onClose }: { user?: User; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => api<AppRole[]>('/roles') });
  const [roleId, setRoleId] = useState(user?.roleId ?? '');
  // Par défaut, un nouvel utilisateur reçoit le rôle « Commercial » s'il existe
  const effectiveRoleId = roleId || roles?.find((r) => r.id === 'role_sales')?.id || roles?.[0]?.id || '';
  const selectedRole = roles?.find((r) => r.id === effectiveRoleId);
  const [password, setPassword] = useState('');
  const save = useMutation({
    mutationFn: () =>
      user
        ? api(`/users/${user.id}`, 'PATCH', { name, roleId: effectiveRoleId, ...(password ? { password } : {}) })
        : api('/users', 'POST', { name, email, roleId: effectiveRoleId, password }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['roles'] });
      toast.success(user ? t('Utilisateur mis à jour') : t('Utilisateur créé'));
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Modal open onClose={onClose} title={user ? t('Modifier l’utilisateur') : t('Nouvel utilisateur')}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={save.error} />
        <Input label={t("Nom complet *")} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Input label={t("Email *")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!!user} />
        <div>
          <Select label={t('Rôle')} value={effectiveRoleId} onChange={(e) => setRoleId(e.target.value)} required>
            {roles?.map((r) => (
              <option key={r.id} value={r.id}>
                {tMaybe(r.name)}
              </option>
            ))}
          </Select>
          {selectedRole && (
            <p className="mt-1 text-xs text-slate-500">
              {selectedRole.description ? tMaybe(selectedRole.description) + ' · ' : ''}
              {selectedRole.scope === 'ALL' ? t('Toutes les fiches') : t('Seulement ses fiches')}
            </p>
          )}
        </div>
        <Input
          label={user ? t('Nouveau mot de passe (laisser vide pour ne pas changer)') : t('Mot de passe initial *')}
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required={!user}
        />
        <FormActions onCancel={onClose} loading={save.isPending} />
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const { user: me, can } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error } = useUsers();
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const toggle = useMutation({
    mutationFn: (u: User) => api(`/users/${u.id}`, 'PATCH', { active: !u.active }),
    onSuccess: (_d, u) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success(u.active ? t('{name} est désactivé(e)', { name: u.name }) : t('{name} est réactivé(e)', { name: u.name }));
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title={t("Utilisateurs")}
        subtitle={t("Gérez les accès de votre équipe")}
        actions={
          <>
            {can('admin.roles') && (
              <Link to="/roles">
                <Button variant="secondary">
                  <ShieldCheck className="h-4 w-4" /> {t('Rôles & droits')}
                </Button>
              </Link>
            )}
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> {t("Nouvel utilisateur")}
            </Button>
          </>
        }
      />
      <Card>
        <ErrorBox error={error} />
        {isLoading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">{t("Nom")}</th>
                  <th className="hidden px-4 py-2.5 sm:table-cell">{t("Email")}</th>
                  <th className="px-4 py-2.5">{t("Rôle")}</th>
                  <th className="px-4 py-2.5">{t("Statut")}</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">{t("Créé le")}</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {u.name} {u.id === me?.id && <span className="text-xs font-normal text-slate-400">{t("(vous)")}</span>}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge tone={u.role?.system ? 'violet' : 'blue'}>{u.role ? tMaybe(u.role.name) : '—'}</Badge>
                      {u.role?.scope === 'OWN' && <span className="ml-1.5 text-xs text-slate-400">{t('Ses fiches')}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={u.active ? 'green' : 'slate'}>{u.active ? t('Actif') : t('Désactivé')}</Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{formatDate(u.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                        {t("Modifier")}
                      </Button>
                      {u.id !== me?.id && (
                        <Button size="sm" variant="ghost" onClick={() => toggle.mutate(u)}>
                          {u.active ? t('Désactiver') : t('Réactiver')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <UserForm user={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
