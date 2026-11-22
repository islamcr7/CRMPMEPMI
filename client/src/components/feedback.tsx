import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

/* ======================================================================
 * Notifications « toast » et fenêtre de confirmation.
 * Petit bus d'événements : appelables partout (composants, mutations, QueryClient).
 * ==================================================================== */

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

let toastListener: ((t: ToastItem) => void) | null = null;
let nextId = 1;
const push = (kind: ToastKind, message: string) => toastListener?.({ id: nextId++, kind, message });

export const toast = {
  success: (m: string) => push('success', m),
  error: (m: string) => push('error', m),
  info: (m: string) => push('info', m),
};

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}
type ConfirmRequest = ConfirmOptions & { resolve: (ok: boolean) => void };
let confirmListener: ((r: ConfirmRequest) => void) | null = null;

/** Remplace window.confirm : `if (await confirmDialog({...})) …` */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!confirmListener) resolve(window.confirm(opts.title));
    else confirmListener({ ...opts, resolve });
  });
}

const TOAST_STYLE: Record<ToastKind, { icon: typeof Info; cls: string }> = {
  success: { icon: CheckCircle2, cls: 'text-emerald-600' },
  error: { icon: XCircle, cls: 'text-red-600' },
  info: { icon: Info, cls: 'text-indigo-600' },
};

/** À monter une seule fois, à la racine de l'application. */
export function FeedbackRoot() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    toastListener = (t) => {
      setToasts((list) => [...list.slice(-3), t]);
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), t.kind === 'error' ? 6000 : 3500);
    };
    confirmListener = setRequest;
    return () => {
      toastListener = null;
      confirmListener = null;
    };
  }, []);

  useEffect(() => {
    if (!request) return;
    confirmBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const close = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  return (
    <>
      <div aria-live="polite" className="no-print pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => {
          const { icon: Icon, cls } = TOAST_STYLE[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className="toast-in pointer-events-auto flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-lg"
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cls}`} />
              <p className="flex-1">{t.message}</p>
              <button onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))} className="text-slate-400 hover:text-slate-600" aria-label="Fermer la notification">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {request && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onMouseDown={() => close(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="dialog-in w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex gap-3">
              {request.danger && (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0">
                <h2 id="confirm-title" className="text-base font-semibold text-slate-900">
                  {request.title}
                </h2>
                {request.message && <div className="mt-1.5 whitespace-pre-line text-sm text-slate-600">{request.message}</div>}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => close(false)} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Annuler
              </button>
              <button
                ref={confirmBtn}
                onClick={() => close(true)}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium text-on-accent shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                  request.danger ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500' : 'bg-indigo-600 hover:bg-indigo-700 focus-visible:ring-indigo-500'
                }`}
              >
                {request.confirmLabel ?? 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
