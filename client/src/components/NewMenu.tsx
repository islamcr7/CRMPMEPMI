import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CalendarPlus, ChevronDown, FilePlus, KanbanSquare, Plus, Receipt, UserPlus } from 'lucide-react';
import { ActivityForm, CompanyForm, ContactForm, DealForm } from './forms';
import { useAuth } from '../lib/auth';

import { t } from '../lib/i18n';
type FormKind = 'contact' | 'company' | 'deal' | 'activity';

/** Bouton « + Nouveau » toujours visible : créer n'importe quelle fiche depuis n'importe où. */
export function NewMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormKind | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const { can } = useAuth();
  const items = ([
    { label: t('Contact'), icon: UserPlus, run: () => setForm('contact'), perm: 'contacts.create' },
    { label: t('Entreprise'), icon: Building2, run: () => setForm('company'), perm: 'companies.create' },
    { label: t('Opportunité'), icon: KanbanSquare, run: () => setForm('deal'), perm: 'deals.create' },
    { label: t('Activité / tâche'), icon: CalendarPlus, run: () => setForm('activity'), perm: 'activities.create' },
    { label: t('Devis'), icon: FilePlus, run: () => navigate('/documents/new/QUOTE'), perm: 'quotes.create' },
    { label: t('Facture'), icon: Receipt, run: () => navigate('/documents/new/INVOICE'), perm: 'invoices.create' },
  ] as { label: string; icon: typeof Plus; perm: string; run: () => void }[]).filter((i) => can(i.perm));

  // Rôle en lecture seule : pas de bouton « Nouveau »
  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-on-accent shadow-sm hover:bg-indigo-700"
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">{t("Nouveau")}</span>
        <ChevronDown className="hidden h-3.5 w-3.5 opacity-80 sm:block" />
      </button>
      {open && (
        <div role="menu" className="dialog-in absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.run();
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
            >
              <it.icon className="h-4 w-4 text-slate-400" /> {it.label}
            </button>
          ))}
        </div>
      )}
      {form === 'contact' && <ContactForm open onClose={() => setForm(null)} onSaved={(c) => navigate(`/contacts/${c.id}`)} />}
      {form === 'company' && <CompanyForm open onClose={() => setForm(null)} onSaved={(c) => navigate(`/companies/${c.id}`)} />}
      {form === 'deal' && <DealForm open onClose={() => setForm(null)} onSaved={(d) => navigate(`/deals/${d.id}`)} />}
      {form === 'activity' && <ActivityForm open onClose={() => setForm(null)} />}
    </div>
  );
}
