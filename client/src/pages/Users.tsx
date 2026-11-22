import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/format';
import type { Role, User } from '../types';
import { Badge, Button, Card, ErrorBox, FormActions, Input, Modal, PageHeader, Select, Spinner } from '../components/ui';
import { useUsers } from '../components/pickers';

function UserForm({ user, onClose }: { user?: User; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'SALES');
  const [password, setPassword] = useState('');
  const save = useMutation({
    mutationFn: () =>
      user
        ? api(`/users/${user.id}`, 'PATCH', { name, role, ...(password ? { password } : {}) })
        : api('/users', 'POST', { name, email, role, password }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Modal open onClose={onClose} title={user ? 'Modifier l’utilisateur' : 'Nouvel utilisateur'}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox error={save.error} />
        <Input label="Nom complet *" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Input label="Email *" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!!user} />
        <Select label="Rôle" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="SALES">Commercial</option>
          <option value="ADMIN">Administrateur</option>
        </Select>
        <Input
          label={user ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe initial *'}
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
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error } = useUsers();
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const toggle = useMutation({
    mutationFn: (u: User) => api(`/users/${u.id}`, 'PATCH', { active: !u.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e) => alert(e.message),
  });

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        subtitle="Gérez les accès de votre équipe"
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Nouvel utilisateur
          </Button>
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
                  <th className="px-4 py-2.5">Nom</th>
                  <th className="hidden px-4 py-2.5 sm:table-cell">Email</th>
                  <th className="px-4 py-2.5">Rôle</th>
                  <th className="px-4 py-2.5">Statut</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">Créé le</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {u.name} {u.id === me?.id && <span className="text-xs font-normal text-slate-400">(vous)</span>}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge tone={u.role === 'ADMIN' ? 'violet' : 'blue'}>{u.role === 'ADMIN' ? 'Admin' : 'Commercial'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={u.active ? 'green' : 'slate'}>{u.active ? 'Actif' : 'Désactivé'}</Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{formatDate(u.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                        Modifier
                      </Button>
                      {u.id !== me?.id && (
                        <Button size="sm" variant="ghost" onClick={() => toggle.mutate(u)}>
                          {u.active ? 'Désactiver' : 'Réactiver'}
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
