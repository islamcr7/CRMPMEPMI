import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Circle, Rocket, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import type { Dashboard } from '../types';

import { t } from '../lib/i18n';
const STEPS: { key: keyof Dashboard['setup']; label: string; hint: string; to: string; admin?: boolean }[] = [
  { key: 'orgConfigured', label: t('Renseigner votre entreprise'), hint: t('Nom, adresse, TVA : repris sur vos devis et factures'), to: '/settings', admin: true },
  { key: 'contacts', label: t('Ajouter ou importer vos contacts'), hint: t('Import CSV depuis Excel ou un autre CRM'), to: '/contacts' },
  { key: 'products', label: t('Créer votre catalogue'), hint: t('Vos produits et prestations, réutilisables dans les devis'), to: '/products' },
  { key: 'deals', label: t('Suivre une première opportunité'), hint: t('Faites-la avancer étape par étape dans le pipeline'), to: '/pipeline' },
  { key: 'quotes', label: t('Envoyer un premier devis'), hint: t('Transformez-le en facture en un clic une fois accepté'), to: '/documents/new/QUOTE' },
  { key: 'team', label: t('Inviter votre équipe'), hint: t('Chaque commercial a son propre accès'), to: '/users', admin: true },
];

/** Guide « Premiers pas » : se masque une fois terminé ou fermé. */
export function GettingStarted({ setup }: { setup: Dashboard['setup'] }) {
  const { user } = useAuth();
  const storageKey = `crm-onboarding-hidden-${user?.id}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  });

  const steps = STEPS.filter((s) => !s.admin || user?.role === 'ADMIN');
  const done = steps.filter((s) => setup[s.key]).length;
  if (hidden || done === steps.length) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      /* ignoré */
    }
  };

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-sm" aria-labelledby="onboarding-title">
      <div className="flex items-start justify-between gap-3 bg-indigo-50 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-on-accent">
            <Rocket className="h-4 w-4" />
          </div>
          <div>
            <h2 id="onboarding-title" className="text-sm font-semibold text-slate-900">
              {t("Premiers pas")}
            </h2>
            <p className="text-xs text-slate-600">
              {done} {t("sur")} {steps.length} {t("étapes terminées")}
            </p>
          </div>
        </div>
        <button onClick={dismiss} className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-600" aria-label={t("Masquer le guide")} title={t("Masquer le guide")}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="h-1 bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
        <div className="h-1 bg-indigo-600 transition-[width] duration-500" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ul className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => {
          const ok = setup[s.key];
          return (
            <li key={s.key} className="bg-white">
              <Link to={s.to} className="group flex h-full items-start gap-3 px-4 py-3 hover:bg-slate-50">
                {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />}
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-medium ${ok ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{s.label}</span>
                  <span className="block text-xs text-slate-500">{s.hint}</span>
                </span>
                {!ok && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 group-hover:text-indigo-500" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
