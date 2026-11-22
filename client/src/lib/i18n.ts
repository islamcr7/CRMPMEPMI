/* ======================================================================
 * Traduction de l'interface (français par défaut, anglais).
 *
 * Les textes sont écrits en français dans le code et passés à t() :
 * le français sert de clé, le dictionnaire anglais (en.ts) donne la
 * traduction. Un texte absent du dictionnaire reste en français.
 *
 * Changer de langue recharge la page : tous les textes, y compris ceux
 * définis au chargement des modules (menus, étapes…), sont alors recalculés.
 * ==================================================================== */
import { EN } from './en';

export type Lang = 'fr' | 'en';
const KEY = 'crm-lang';

function read(): Lang {
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'fr';
  } catch {
    return 'fr';
  }
}

const current: Lang = read();
if (typeof document !== 'undefined') document.documentElement.lang = current;

export const getLang = () => current;

/** Locale des formats de date, nombre et monnaie. */
export const locale = () => (current === 'en' ? 'en-GB' : 'fr-FR');

/** Traduit un texte ; `{nom}` est remplacé par vars.nom. */
export function t(text: string, vars?: Record<string, string | number | null | undefined>): string {
  let s = current === 'en' ? EN[text] ?? text : text;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m));
  return s;
}

/** Traduit un message s'il est connu (ex. erreurs renvoyées par l'API). */
export const tMaybe = (text: string) => (current === 'en' ? EN[text] ?? text : text);

export function setLang(lang: Lang) {
  if (lang === current) return;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* stockage indisponible : la langue ne sera pas mémorisée */
  }
  window.location.reload();
}

export const LANGS: { value: Lang; label: string; short: string }[] = [
  { value: 'fr', label: 'Français', short: 'FR' },
  { value: 'en', label: 'English', short: 'EN' },
];
