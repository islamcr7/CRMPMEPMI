import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Upload } from 'lucide-react';
import { CsvImport, ExportButton } from '../components/CsvImport';
import { api, toQuery } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Company, Paginated } from '../types';
import { Button, Card, EmptyState, ErrorBox, PageHeader, Pagination, SearchInput, Select, Spinner, useDebounce } from '../components/ui';
import { CompanyForm } from '../components/forms';

export default function CompaniesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const search = useDebounce(q);

  const { data, isLoading, error } = useQuery({
    queryKey: ['companies', search, mine, page],
    queryFn: () => api<Paginated<Company>>(`/companies${toQuery({ q: search, ownerId: mine && user?.id, page })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Entreprises"
        subtitle={data ? `${data.total} entreprise(s)` : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <Upload className="h-4 w-4" /> Importer
            </Button>
            <ExportButton entity="companies" />
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Nouvelle entreprise
            </Button>
          </>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <SearchInput value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Nom, ville, secteur…" />
          <Select value={mine ? 'mine' : 'all'} onChange={(e) => (setMine(e.target.value === 'mine'), setPage(1))} className="sm:w-48">
            <option value="all">Toutes</option>
            <option value="mine">Mes entreprises</option>
          </Select>
        </div>
        <ErrorBox error={error} />
        {isLoading ? (
          <Spinner />
        ) : !data?.items.length ? (
          <EmptyState title="Aucune entreprise">Créez votre première fiche entreprise.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Entreprise</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">Secteur</th>
                  <th className="hidden px-4 py-2.5 sm:table-cell">Ville</th>
                  <th className="hidden px-4 py-2.5 lg:table-cell">Téléphone</th>
                  <th className="px-4 py-2.5 text-center">Contacts</th>
                  <th className="hidden px-4 py-2.5 text-center sm:table-cell">Opport.</th>
                  <th className="hidden px-4 py-2.5 md:table-cell">Responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/companies/${c.id}`)}>
                    <td className="px-4 py-3">
                      <Link to={`/companies/${c.id}`} className="font-medium text-slate-900 hover:text-indigo-600" onClick={(e) => e.stopPropagation()}>
                        {c.name}
                      </Link>
                      {c.size && <div className="text-xs text-slate-400">{c.size} salariés</div>}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{c.industry ?? '—'}</td>
                    <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{c.city ?? '—'}</td>
                    <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-slate-600">{c._count?.contacts ?? 0}</td>
                    <td className="hidden px-4 py-3 text-center tabular-nums text-slate-600 sm:table-cell">{c._count?.deals ?? 0}</td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{c.owner?.name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </Card>
      {creating && <CompanyForm open onClose={() => setCreating(false)} onSaved={(c) => navigate(`/companies/${c.id}`)} />}
      {importing && <CsvImport entity="companies" onClose={() => setImporting(false)} />}
    </>
  );
}
