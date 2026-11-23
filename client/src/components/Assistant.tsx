import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bot, Check, CheckCircle2, Copy, Loader2, RotateCcw, SendHorizontal, Sparkles, X, XCircle } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { getLang, t } from '../lib/i18n';
import { formatDate } from '../lib/format';
import { ACTIVITY_TYPES, STAGES, label } from '../lib/labels';
import type { ActivityType, DealStage } from '../types';
import { Markdown } from './Markdown';
import { toast } from './feedback';

/* ---------- Échanges avec le serveur ---------- */

type Transcript = unknown[]; // conversation au format du fournisseur, renvoyée telle quelle
interface Pending {
  id: string;
  tool: string;
  summary: string;
  details: Record<string, unknown>;
}
interface ActionResult {
  summary: string;
  ok: boolean;
  error?: string;
  link?: string;
}
interface ChatResponse {
  reply: string;
  pending: Pending[];
  actions: ActionResult[];
  transcript: Transcript;
}

/** Éléments affichés dans le fil (distincts de la conversation technique). */
type Item = { kind: 'user'; text: string } | { kind: 'assistant'; text: string } | { kind: 'actions'; actions: ActionResult[] } | { kind: 'error'; text: string };

interface State {
  items: Item[];
  transcript: Transcript;
  pending: Pending[];
}
const EMPTY: State = { items: [], transcript: [], pending: [] };

/** Conversation gardée pour la durée de l'onglet (par utilisateur). */
const storageKey = (userId?: string) => `crm-assistant-${userId}`;
function load(userId?: string): State {
  try {
    const v = JSON.parse(sessionStorage.getItem(storageKey(userId)) ?? 'null');
    return v && Array.isArray(v.items) ? v : EMPTY;
  } catch {
    return EMPTY;
  }
}

/* ---------- Détails lisibles d'une action à confirmer ---------- */

function detailLines(p: Pending): string[] {
  const d = p.details as Record<string, string | number | boolean | undefined>;
  const lines: string[] = [];
  if (d.type) lines.push(`${t('Type')} : ${label(ACTIVITY_TYPES, d.type as ActivityType)}`);
  if (d.subject) lines.push(`${t('Objet')} : ${d.subject}`);
  if (d.dueDate) lines.push(`${t('Échéance')} : ${formatDate(String(d.dueDate), true)}`);
  if (d.stage) lines.push(`${t('Étape')} : ${label(STAGES, d.stage as DealStage)}`);
  if (d.amount !== undefined) lines.push(`${t('Montant HT')} : ${d.amount}`);
  if (d.probability !== undefined) lines.push(`${t('Probabilité')} : ${d.probability} %`);
  if (d.expectedCloseDate) lines.push(`${t('Clôture prévue')} : ${formatDate(String(d.expectedCloseDate))}`);
  if (d.firstName || d.lastName) lines.push(`${t('Nom')} : ${[d.firstName, d.lastName].filter(Boolean).join(' ')}`);
  if (d.email) lines.push(`${t('Email')} : ${d.email}`);
  if (d.phone) lines.push(`${t('Téléphone')} : ${d.phone}`);
  if (d.description) lines.push(`${t('Description')} : ${String(d.description).slice(0, 200)}`);
  return lines;
}

const SUGGESTIONS = [
  'Quelles sont mes priorités aujourd’hui ?',
  'Quelles factures sont en retard de paiement ?',
  'Résume l’état de mon pipeline',
  'Quelles opportunités risquent de ne pas aboutir ?',
];

/* ---------- Composant ---------- */

export function Assistant() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>(() => load(user?.id));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { data: status } = useQuery({ queryKey: ['agent-status'], queryFn: () => api<{ enabled: boolean; model: string | null }>('/agent/status'), staleTime: 60_000 });

  // Mémorise la conversation
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(user?.id), JSON.stringify(state));
    } catch {
      /* ignoré */
    }
  }, [state, user?.id]);

  // Défile vers le bas à chaque nouvel élément
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [state.items.length, state.pending.length, busy, open]);

  // Raccourci Ctrl+J et ouverture depuis la palette de commandes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('crm:assistant-open', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('crm:assistant-open', onOpen);
    };
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const send = useCallback(
    async (payload: { message?: string; decision?: { approved: boolean } }) => {
      setBusy(true);
      if (payload.message) setState((s) => ({ ...s, items: [...s.items, { kind: 'user', text: payload.message! }], pending: [] }));
      try {
        const r = await api<ChatResponse>('/agent/chat', 'POST', { lang: getLang(), transcript: state.transcript, ...payload });
        setState((s) => ({
          transcript: r.transcript,
          pending: r.pending,
          items: [
            ...s.items,
            ...(r.actions.length ? [{ kind: 'actions' as const, actions: r.actions }] : []),
            ...(r.reply.trim() ? [{ kind: 'assistant' as const, text: r.reply }] : []),
          ],
        }));
        // Une action a modifié des données : on rafraîchit l'écran
        if (r.actions.some((a) => a.ok)) qc.invalidateQueries();
      } catch (e) {
        setState((s) => ({ ...s, items: [...s.items, { kind: 'error', text: errorMessage(e) }] }));
      } finally {
        setBusy(false);
      }
    },
    [state.transcript, qc],
  );

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    send({ message: text });
  };

  const reset = () => {
    setState(EMPTY);
    setInput('');
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('Copié dans le presse-papiers'));
    } catch {
      toast.error(t('Copie impossible'));
    }
  };

  return (
    <>
      {/* Bouton flottant */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="no-print fixed bottom-5 right-5 z-40 flex h-12 items-center gap-2 rounded-full bg-indigo-600 pl-4 pr-5 text-sm font-medium text-on-accent shadow-lg shadow-indigo-600/25 transition hover:-translate-y-0.5 hover:bg-indigo-700"
          aria-label={t('Ouvrir l’assistant IA')}
          title={t('Assistant IA (Ctrl+J)')}
        >
          <Sparkles className="h-5 w-5" />
          <span className="hidden sm:inline">{t('Assistant')}</span>
        </button>
      )}

      {open && (
        <aside
          role="dialog"
          aria-label={t('Assistant IA')}
          className="no-print dialog-in fixed inset-0 z-50 flex flex-col border-l border-slate-200 bg-white shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[440px]"
        >
          <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-on-accent">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900">{t('Assistant IA')}</div>
              <div className="truncate text-xs text-slate-500">{status?.model ? status.model : t('Votre copilote commercial')}</div>
            </div>
            {state.items.length > 0 && (
              <button onClick={reset} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title={t('Nouvelle conversation')} aria-label={t('Nouvelle conversation')}>
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            <button onClick={() => setOpen(false)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={t('Fermer')}>
              <X className="h-5 w-5" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
            {status && !status.enabled ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700">
                <div className="mb-1 flex items-center gap-2 font-medium text-slate-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600" /> {t('Assistant non configuré')}
                </div>
                {t('L’administrateur doit renseigner la clé API, l’adresse et le modèle du fournisseur IA (AI_API_KEY, AI_BASE_URL, AI_MODEL) dans la configuration du serveur.')}
              </div>
            ) : state.items.length === 0 ? (
              <div className="pt-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <Sparkles className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-slate-800">{t('Bonjour {name}, comment puis-je vous aider ?', { name: user?.name.split(' ')[0] })}</p>
                <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500">{t('Je consulte vos données CRM, prépare des actions et rédige vos messages. Je vous demande toujours confirmation avant de modifier quoi que ce soit.')}</p>
                <div className="mt-5 space-y-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send({ message: t(s) })}
                      disabled={busy}
                      className="block w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50"
                    >
                      {t(s)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              state.items.map((it, i) =>
                it.kind === 'user' ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-indigo-600 px-3.5 py-2 text-sm text-on-accent">{it.text}</div>
                  </div>
                ) : it.kind === 'assistant' ? (
                  <div key={i} className="group flex gap-2">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2.5 text-sm text-slate-800">
                        <Markdown text={it.text} />
                      </div>
                      <button onClick={() => copy(it.text)} className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400 opacity-100 hover:text-slate-700 sm:opacity-0 sm:group-hover:opacity-100">
                        <Copy className="h-3 w-3" /> {t('Copier')}
                      </button>
                    </div>
                  </div>
                ) : it.kind === 'actions' ? (
                  <ul key={i} className="space-y-1.5 pl-9">
                    {it.actions.map((a, j) => (
                      <li key={j} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${a.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                        {a.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                        <span className="min-w-0">
                          {a.summary}
                          {!a.ok && <span className="block text-slate-500">{a.error === 'refused' ? t('Annulé') : a.error}</span>}
                          {a.link && (
                            <Link to={a.link} className="ml-1 font-medium underline">
                              {t('Voir')}
                            </Link>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {it.text}
                  </div>
                ),
              )
            )}

            {/* Actions proposées : confirmation obligatoire */}
            {state.pending.length > 0 && !busy && (
              <div className="ml-9 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3" role="group" aria-label={t('Action à confirmer')}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">{t('Action à confirmer')}</div>
                <ul className="space-y-2">
                  {state.pending.map((p) => (
                    <li key={p.id} className="rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                      <div className="font-medium text-slate-900">{p.summary}</div>
                      {detailLines(p).map((l) => (
                        <div key={l} className="text-xs text-slate-500">
                          {l}
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => send({ decision: { approved: true } })}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-on-accent hover:bg-indigo-700"
                  >
                    <Check className="h-4 w-4" /> {t('Confirmer')}
                  </button>
                  <button
                    onClick={() => send({ decision: { approved: false } })}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('Annuler')}
                  </button>
                </div>
              </div>
            )}

            {busy && (
              <div className="flex items-center gap-2 pl-9 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('L’assistant réfléchit…')}
              </div>
            )}
          </div>

          <form onSubmit={submit} className="border-t border-slate-200 p-3">
            <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                maxLength={4000}
                disabled={status?.enabled === false}
                placeholder={state.pending.length ? t('Répondez, ou confirmez l’action ci-dessus…') : t('Posez une question ou demandez une action…')}
                aria-label={t('Message pour l’assistant')}
                className="max-h-32 min-h-6 flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!input.trim() || busy || status?.enabled === false}
                className="rounded-lg bg-indigo-600 p-1.5 text-on-accent hover:bg-indigo-700 disabled:opacity-40"
                aria-label={t('Envoyer')}
              >
                <SendHorizontal className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[11px] text-slate-400">{t('L’IA peut se tromper : vérifiez les informations importantes.')}</p>
          </form>
        </aside>
      )}
    </>
  );
}
