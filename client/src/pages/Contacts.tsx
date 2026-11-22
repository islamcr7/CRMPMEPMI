import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Upload } from 'lucide-react';
import { CsvImport, ExportButton } from '../components/CsvImport';
import { api, toQuery } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fullName } from '../lib/format';
import { CONTACT_STATUSES, label, tone } from '../lib/labels';
import type { Contact, Paginated } from '../types';
import { Badge, Button, Card, EmptyState, ErrorBox, PageHeader, Pagination, SearchInput, Select, Spinner, useDebounce } from '../components/ui';
import { Owner } from '../components/OwnerCell';
import { ContactForm } from '../components/forms';

export default function ContactsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const search = useDebounce(q);

  const { data, isLoading, error } = useQuery({
    queryKey: ['contacts', search, status, mine, page],
    queryFn: () => api<Paginated<Contact>>(`/contacts${toQuery({ q: search, status, ownerId: mine && user?.id, page })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle={data ? `${data.total} contact(s)` : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <Upload className="h-4 w-4" /> Importer
            </Button>
            <ExportButton entity="contacts" />
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Nouveau contact
            </Button>
          </>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <SearchInput value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Nom, email, téléphone, entreprise…" />
          <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="sm:w-44">
            <option value="">Tous les statuts</option>
            {CONTACT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select value={mine ? 'mine' : 'all'} onChange={(e) => (setMine(e.target.value === 'mine'), setPage(1))} className="sm:w-44">
            <option value="all">Tous</option>
            <option value="mine">Mes contacts</option>
          </Select>
        </div>
        <ErrorBox error={error} />
        {isLoading ? (
          <Spinner />
        ) : !data?.items.length ? (
          <EmptyState title="Aucun contact" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Nom</th>
                  <th className="hidden px-4 py-2.5 sm:table-cell">Entreprise</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">Email</th>
                  <th className="hidden px-4 py-2.5 lg:table-cell">Téléphone</th>
                  <th className="px-4 py-2.5">Statut</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">Responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/contacts/${c.id}`)}>
                    <td className="px-4 py-3">
                      <Link to={`/contacts/${c.id}`} className="font-medium text-slate-900 hover:text-indigo-600" onClick={(e) => e.stopPropagation()}>
                        {fullName(c)}
                      </Link>
                      {c.position && <div className="text-xs text-slate-400">{c.position}</div>}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{c.company?.name ?? '—'}</td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{c.email ?? '—'}</td>
                    <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={tone(CONTACT_STATUSES, c.status)}>{label(CONTACT_STATUSES, c.status)}</Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell"><Owner owner={c.owner} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </Card>
      {creating && <ContactForm open onClose={() => setCreating(false)} onSaved={(c) => navigate(`/contacts/${c.id}`)} />}
      {importing && <CsvImport entity="contacts" onClose={() => setImporting(false)} />}
    </>
  );
}
