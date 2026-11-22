import { Link } from 'react-router-dom';
import { useMoney, formatDate, fullName } from '../lib/format';
import { CONTACT_STATUSES, DOC_STATUSES, DOC_TYPES, STAGES, label, tone } from '../lib/labels';
import type { Contact, Deal, DocumentSummary } from '../types';
import { Badge, EmptyState } from './ui';

export function DealRows({ deals }: { deals: Deal[] }) {
  const money = useMoney();
  if (!deals.length) return <EmptyState title="Aucune opportunité" />;
  return (
    <ul className="divide-y divide-slate-100">
      {deals.map((d) => (
        <li key={d.id}>
          <Link to={`/deals/${d.id}`} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-800">{d.title}</div>
              <div className="text-xs text-slate-500">
                {d.expectedCloseDate ? `Clôture ${formatDate(d.expectedCloseDate)}` : 'Sans date'} · {d.probability} %
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-medium tabular-nums text-slate-700">{money(d.amount)}</span>
              <Badge tone={tone(STAGES, d.stage)}>{label(STAGES, d.stage)}</Badge>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ContactRows({ contacts }: { contacts: Contact[] }) {
  if (!contacts.length) return <EmptyState title="Aucun contact" />;
  return (
    <ul className="divide-y divide-slate-100">
      {contacts.map((c) => (
        <li key={c.id}>
          <Link to={`/contacts/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-800">{fullName(c)}</div>
              <div className="truncate text-xs text-slate-500">{[c.position, c.email, c.phone].filter(Boolean).join(' · ') || '—'}</div>
            </div>
            <Badge tone={tone(CONTACT_STATUSES, c.status)}>{label(CONTACT_STATUSES, c.status)}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DocumentRows({ documents }: { documents: DocumentSummary[] }) {
  const money = useMoney();
  if (!documents.length) return <EmptyState title="Aucun devis ni facture" />;
  return (
    <ul className="divide-y divide-slate-100">
      {documents.map((d) => (
        <li key={d.id}>
          <Link to={`/documents/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-800">
                {DOC_TYPES[d.type].label} {d.number}
              </div>
              <div className="text-xs text-slate-500">{formatDate(d.issueDate)}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm tabular-nums text-slate-700">
                {d.type === 'CREDIT_NOTE' ? '−' : ''}
                {money(d.total)}
              </span>
              {d.type === 'CREDIT_NOTE' ? <Badge tone="violet">Avoir</Badge> : <Badge tone={DOC_STATUSES[d.status].tone}>{DOC_STATUSES[d.status].label}</Badge>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
