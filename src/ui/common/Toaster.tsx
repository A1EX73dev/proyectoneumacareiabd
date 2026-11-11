import { useEffect } from 'react';
import { openRoomView } from '../actions';
import { useT } from '../hooks';
import { dismissToast, useOverlay, type Toast } from '../overlay';
import { Icon } from './Icon';

const VISIBLE_MS = 7000;

function ToastCard({ toast }: { toast: Toast }) {
  const { t } = useT();

  useEffect(() => {
    const timer = window.setTimeout(() => dismissToast(toast.id), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id]);

  const ok = toast.tone === 'success';
  return (
    <li className="pointer-events-auto flex w-full animate-slide-up items-start gap-3 rounded-xl bg-white p-3 shadow-lg ring-1 ring-slate-200">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
        }`}
      >
        <Icon name={ok ? 'check' : 'alert'} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
        {toast.detail && <p className="mt-0.5 text-sm text-slate-600">{toast.detail}</p>}
        {toast.room && (
          <button
            type="button"
            onClick={() => {
              if (toast.room) openRoomView(toast.room);
              dismissToast(toast.id);
            }}
            className="mt-1.5 text-sm font-semibold text-teal-800 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
          >
            {t('toast.openRoom', { room: toast.room })}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        aria-label={t('common.close')}
        className="btn btn-ghost -mr-1 -mt-1 px-1.5 py-1.5"
      >
        <Icon name="x" />
      </button>
    </li>
  );
}

/** Avisos emergentes (resultado de una acción). Se anuncian a los lectores de pantalla. */
export function Toaster() {
  const { t } = useT();
  const toasts = useOverlay((s) => s.toasts);
  return (
    <ol
      aria-live="polite"
      aria-label={t('toast.region')}
      className="pointer-events-none fixed bottom-16 right-3 z-40 flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </ol>
  );
}
