import { Languages } from 'lucide-react';
import { getLang, LANGS, setLang, t } from '../lib/i18n';

/** Sélecteur de langue (FR / EN) ; le choix est mémorisé et la page se recharge. */
export function LangSwitch() {
  const current = getLang();
  return (
    <div role="radiogroup" aria-label={t('Langue')} className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      <Languages className="mx-1 hidden h-3.5 w-3.5 text-slate-400 sm:block" aria-hidden="true" />
      {LANGS.map((l) => (
        <button
          key={l.value}
          role="radio"
          aria-checked={current === l.value}
          aria-label={l.label}
          title={l.label}
          lang={l.value}
          onClick={() => setLang(l.value)}
          className={`rounded-md px-1.5 py-1 text-[11px] font-semibold transition-colors ${
            current === l.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}
